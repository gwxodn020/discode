// Runtime test of the installed Nix package. All Discord requests are fulfilled with a fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
class CDP {
 constructor(url) {
  this.socket = new WebSocket(url); this.next = 0; this.pending = new Map();
  this.ready = new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve, {once:true}); this.socket.addEventListener('error', reject, {once:true}); });
  this.socket.addEventListener('message', event => {
   const data = JSON.parse(event.data);
   if (data.id) {
    const pending = this.pending.get(data.id); if (!pending) return;
    this.pending.delete(data.id); clearTimeout(pending.timeout);
    if (data.error) pending.reject(Error(JSON.stringify(data.error))); else pending.resolve(data.result);
   } else if (this.onEvent) this.onEvent(data);
  });
 }
 async send(method, params = {}) {
  await this.ready; const id = ++this.next;
  return new Promise((resolve, reject) => {
   const timeout = setTimeout(() => { this.pending.delete(id); reject(Error('CDP timeout: '+method)); }, 15000);
   this.pending.set(id, {resolve,reject,timeout}); this.socket.send(JSON.stringify({id,method,params}));
  });
 }
 async evaluate(expression) {
  const result = await this.send('Runtime.evaluate', {expression,awaitPromise:true,returnByValue:true});
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
 }
 close() { for (const p of this.pending.values()) {clearTimeout(p.timeout);p.reject(Error('CDP closed'));} this.pending.clear();this.socket.close(); }
}
(async () => {
 const executable = process.argv[2]; if (!executable) throw Error('Usage: node test/nix-smoke.cjs /path/to/discode');
 const profile = await fs.mkdtemp(path.join(os.tmpdir(),'discode-nix-test-'));
 const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
 const args = ['--disable-gpu','--remote-debugging-port=0','--user-data-dir='+profile];
 if (process.env.DISCODE_TEST_NO_SANDBOX === '1') args.push('--no-sandbox');
 const child = spawn(executable,args,{env,stdio:['ignore','pipe','pipe']});
 let logs = '', exited = false; const clients=[];
 child.on('error',error=>{logs+=error.message;exited=true;});child.on('exit',()=>{exited=true;});
 child.stdout.on('data',data=>{logs=(logs+data).slice(-12000);});child.stderr.on('data',data=>{logs=(logs+data).slice(-12000);});
 try {
  let pages, base;
  for(let i=0;i<100;i++) {
   if(exited)throw Error('App exited before readiness: '+logs);
   try {
    const port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];
    base='http://127.0.0.1:'+port;
    pages=await (await fetch(base+'/json/list')).json();
    if(pages.some(p=>p.url.startsWith('file:')) && pages.some(p=>!p.url.startsWith('file:')))break;
   } catch {}
   await wait(200);
  }
  assert(pages?.length,'DevTools did not become ready: '+logs);
  const shellPage=pages.find(p=>p.url.startsWith('file:'));
  const guestPage=pages.find(p=>!p.url.startsWith('file:') && p.type==='page');
  assert(shellPage && guestPage,'Expected shell and Discord view: '+JSON.stringify(pages));
  const shell=new CDP(shellPage.webSocketDebuggerUrl),guest=new CDP(guestPage.webSocketDebuggerUrl); clients.push(shell,guest);
  let interceptionError;
  const fixture='<!doctype html><title>Nix fixture</title><a href="/channels/@me/123">Nix friend</a><ul id="list"><li id="chat-messages-123-1"><span id="message-username-1">Nix friend</span><div id="message-content-1">Nix runtime ready</div></li></ul><div role="textbox" contenteditable="true" style="height:60px"></div><script>const box=document.querySelector("[role=textbox]");box.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const li=document.createElement("li");li.id="chat-messages-123-2";const content=document.createElement("div");content.id="message-content-2";content.textContent=box.textContent;li.append(content);document.querySelector("#list").append(li);box.textContent="";}})</script>';
  guest.onEvent=event=>{if(event.method==='Fetch.requestPaused')guest.send('Fetch.fulfillRequest',{requestId:event.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'}],body:Buffer.from(fixture).toString('base64')}).catch(error=>{interceptionError=error;});};
  await guest.send('Fetch.enable',{patterns:[{urlPattern:'https://discord.com/*',requestStage:'Request'}]});
  await guest.send('Page.navigate',{url:'https://discord.com/channels/@me/123'});
  let ready=false;
  for(let i=0;i<80;i++) {
   if(interceptionError)throw interceptionError;
   ready=await shell.evaluate('!!window.discordCode && !document.querySelector("#draft").disabled && document.querySelector("#messages").textContent.includes("Nix runtime ready")');
   if(ready)break;await wait(200);
  }
  assert(ready,'Nix application did not render fixture: '+logs);
  const result=await shell.evaluate('(async()=>{await document.fonts.ready;return {runtime:navigator.userAgent,title:document.title,terminal:!!document.querySelector("#terminal"),icons:document.fonts.check("16px codicon"),sent:await window.discordCode.send({target:"/channels/@me/123",text:"Nix 테스트 😀"})};})()');
  assert.equal(result.title,'Discord Code');assert(result.terminal && result.icons);assert.equal(result.sent.observed,true);
  console.log(JSON.stringify({status:'PASS',runtime:result.runtime,nixStore:executable.startsWith('/nix/store/'),checks:['local app startup','bundled assets and icon font','Discord fixture extraction','terminal IPC send confirmation'],liveDiscord:false}));
 } finally {
  for(const client of clients)client.close();
  if(!exited) { child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),wait(2000)]);if(!exited)child.kill('SIGKILL'); }
  await fs.rm(profile,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
