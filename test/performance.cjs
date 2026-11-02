// Synthetic workload only: never signs in, reads a real account or sends a message.
const { _electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
 const app = await _electron.launch({ args: [path.join(__dirname, 'login-harness.cjs')], env });
 try {
  await app.firstWindow();
  const page = app.context().pages().find(p => p.url().startsWith('file:'));
  await app.evaluate(async ({ BrowserWindow }) => {
   const wc = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents).webContents;
   wc.stop();
   wc.session.protocol.handle('https', () => new Response('<!doctype html><a href="/channels/@me/123">친구</a><li id="chat-messages-123-1"><span id="message-username-1">친구</span><div id="message-content-1">fixture</div></li><div role="textbox" contenteditable="true" style="height:50px"></div>', { headers: {'Content-Type':'text/html'} }));
   await wc.loadURL('https://discord.com/channels/@me/123');
   await wc.executeJavaScript(`window.__scans=0; const query=document.querySelectorAll.bind(document); document.querySelectorAll=(s)=>{ if(s==='[id^="chat-messages-"]')window.__scans++; return query(s); }; true`);
  });
  await page.waitForFunction(() => document.querySelector('#draft').disabled === false);
  const scans = () => app.evaluate(async ({BrowserWindow}) => BrowserWindow.getAllWindows()[0].contentView.children.find(v=>v.webContents).webContents.executeJavaScript('window.__scans'));
  await new Promise(r=>setTimeout(r,200));
  const before = await scans();
  await new Promise(r=>setTimeout(r,4200));
  const idleScans = (await scans()) - before;
  const render = await page.evaluate(() => {
   const rows=Array.from({length:300},(_,i)=>({id:'msg-'+i,author:'친구',text:'메시지 '+i,time:'',attachments:[]}));
   const channels=Array.from({length:200},(_,i)=>({path:'/channels/@me/'+(123+i),name:'대화 '+i,group:'@me'}));
   const base={route:'/channels/@me/123',loggedIn:true,canSend:true,composerText:'',title:'친구',channels,servers:[],rows};
   window.render(base);
   const first=document.querySelector('#messages .message');
   const nav=document.querySelector('#channels button');
   const observer=new MutationObserver(()=>{}); observer.observe(document.querySelector('#messages'),{childList:true,subtree:true});
   const times=[]; let added=0,removed=0;
   for(let i=0;i<10;i++) {
    rows.push({id:'new-'+i,author:'친구',text:'추가 메시지 '+i,time:'',attachments:[]});
    const start=performance.now(); window.render({...base,rows:[...rows]}); times.push(performance.now()-start);
    for(const record of observer.takeRecords()){added+=record.addedNodes.length;removed+=record.removedNodes.length;}
   }
   observer.disconnect(); times.sort((a,b)=>a-b);
   const firstRetained = first === document.querySelector('#messages .message');
   const navRetained = nav === document.querySelector('#channels button');
   const stable = document.querySelectorAll('#messages .message')[1];
   rows.unshift({id:'older-message',author:'친구',text:'이전 메시지',time:'',attachments:[]});
   window.render({...base,rows:[...rows]});
   if (![...document.querySelectorAll('#messages .message')].includes(stable)) throw Error('Prepending history rebuilt unchanged messages');
   rows[1] = {...rows[1], text:'수정된 메시지'};
   window.render({...base,rows:[...rows]});
   if (!document.querySelector('#messages').textContent.includes('수정된 메시지')) throw Error('Message edit was not applied');
   rows.shift(); window.render({...base,rows:[...rows]});
   if (document.querySelector('#messages').textContent.includes('이전 메시지')) throw Error('Removed message was retained');
   return {messages:300,channels:200,updates:10,medianRenderMs:times[5],maxRenderMs:times[9],addedNodes:added,removedNodes:removed,firstMessageRetained:firstRetained,navRetained};
  });
  const result={idleWindowMs:4200,idleFullScans:idleScans,...render};
  console.log(JSON.stringify(result,null,2));
  if (process.argv.includes('--check')) {
   assert.equal(result.idleFullScans, 0);
   assert.equal(result.removedNodes, 0);
   assert(result.firstMessageRetained && result.navRetained);
  }
  if(process.argv[2] && !process.argv[2].startsWith('--'))fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
 } finally { await app.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
