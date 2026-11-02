// Isolated fake Discord page: verifies UI + IPC + DOM flow, never contacts an account.
const { _electron } = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
 const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
 const application = await _electron.launch({ args: [path.join(__dirname, 'login-harness.cjs')], env });
 try {
  const page = await application.firstWindow();
  await application.evaluate(async ({ BrowserWindow }) => {
   const view = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents);
   view.webContents.stop();
   view.webContents.session.protocol.handle('https', () => new Response(`<!doctype html><title>테스트 DM | Discord</title><a href="/channels/@me/123">친구</a><a href="/channels/789/456">개발</a><div data-list-item-id="guildsnav___789" aria-label="개발 서버" onclick="location.href='/channels/789'"></div><ul id="list"><li id="chat-messages-123-1"><span id="message-username-1">친구</span><div id="message-content-1">안녕 😀</div></li></ul><div role="textbox" contenteditable="true" style="width:300px;height:80px"></div><script>const box=document.querySelector('[role=textbox]');box.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const id=Date.now();const li=document.createElement('li');li.id='chat-messages-123-'+id;const name=document.createElement('span');name.id='message-username-'+id;name.textContent='나';const content=document.createElement('div');content.id='message-content-'+id;content.textContent=box.textContent;li.append(name,content);document.querySelector('#list').append(li);box.textContent='';}})</script>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
   await view.webContents.loadURL('https://discord.com/channels/@me/123');
  });
  await page.waitForFunction(() => document.querySelector('#draft').disabled === false);
  if (await page.locator('#raw').getAttribute('aria-label') === '코드 화면') await page.locator('#raw').click();
  assert.match(await page.locator('#messages').innerText(), /안녕 😀/);
  await page.locator('#draft').fill('로컬 테스트 한글 😀');
  await page.locator('#draft').press('Enter');
  await page.waitForFunction(() => document.querySelector('#send-status').textContent.includes('새 메시지가'));
  assert.equal(await page.locator('#draft').inputValue(), '');
  await page.waitForFunction(() => document.querySelector('#messages').textContent.includes('로컬 테스트 한글 😀'));
  assert.match(await page.locator('#messages').innerText(), /로컬 테스트 한글 😀/);
  await page.locator('#draft').fill('보존되는 초안');
  await page.getByRole('button', { name: '# 개발.py', exact: true }).count();
  // Switch via DM link first, then server-channel navigation and back.
  await page.locator('#servers button').click();
  await page.waitForFunction(() => document.querySelector('#breadcrumb').textContent.includes('server'));
  assert.equal(await page.locator('#draft').inputValue(), '');
  await page.locator('#dm').click();
  await page.waitForFunction(() => document.querySelector('#folder').textContent.includes('DIRECT'));
  await page.locator('#channels button').filter({ hasText: '친구.py' }).click();
  await page.waitForFunction(() => document.querySelector('#draft').value === '보존되는 초안');
  await page.locator('#toggle-sidebar').click();
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents).getBounds().x), 48);
  await page.locator('#toggle-sidebar').click();
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents).getBounds().x), 298);
  await page.locator('#command').click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'filter');
  await page.locator('#panel').waitFor({ state: 'visible' });
  await page.locator('#output-tab').click();
  await page.locator('#output').waitFor({ state: 'visible' });
  await page.locator('#terminal-tab').click();
  await page.locator('#terminal').waitFor({ state: 'visible' });
  await page.locator('#close-panel').click();
  await page.locator('#panel').waitFor({ state: 'hidden' });
  await page.locator('#toggle-panel').click();
  await page.locator('#panel').waitFor({ state: 'visible' });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1200, 780));
  await page.screenshot({ path: '/tmp/discord-code-flow.png', scale: 'css' });
  console.log('PASS: extraction, real UI send/ack, server selection, DM selection, per-channel draft retention (fake page only)');
 } finally { await application.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
