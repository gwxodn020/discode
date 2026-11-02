const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { route, allowed } = require('../model');
const adapter = require('../adapter');
function page(html, path = '/channels/@me/123') {
  const dom = new JSDOM(html, { url: 'https://discord.com' + path, runScripts: 'outside-only' });
  dom.window.HTMLElement.prototype.getClientRects = function() { return this.hidden ? [] : [{ width: 100, height: 30 }]; };
  return dom;
}
function run(dom, fn, ...args) { return dom.window.eval(`(${fn.toString()})(...${JSON.stringify(args)})`); }
test('channel routes reject external URLs, traversal, scripts and malformed IDs', () => {
  for (const value of ['/channels/@me', '/channels/@me/123', '/channels/123/456', '/channels/123']) assert.equal(route(value), value);
  for (const value of ['https://evil.test/channels/@me', '/channels/@me/123?x=1', '/channels/../123', '/channels/123/456/extra', null, 'javascript:alert(1)']) assert.throws(() => route(value));
  assert(allowed('https://discord.com/login'));
  for (const value of ['https://discord.com.evil.test', 'https://evil-discord.com', 'http://discord.com', 'file:///tmp/a']) assert(!allowed(value));
});
test('extracts channel IDs separately even for identical display names; ignores hidden and external links', () => {
  const dom = page('<a href="/channels/@me/123">친구</a><a href="/channels/@me/456">친구</a><a href="/channels/789/987">general</a><a hidden href="/channels/@me/111">hidden</a><a href="https://evil.test/channels/@me/123">evil</a><div data-list-item-id="guildsnav___789" aria-label="서버 A"></div>');
  const snap = run(dom, adapter.snapshot);
  assert.equal(snap.channels.length, 3);
  assert.equal(new Set(snap.channels.map(c => c.path)).size, 3);
  assert.equal(snap.servers[0].path, '/channels/789');
  assert.equal(snap.servers[0].name, '서버 A');
});
test('reads grouped authors, Unicode, timestamps and only Discord attachment links', () => {
  const dom = page('<li id="chat-messages-123-1"><span id="message-username-1">한글 😀</span><time datetime="2026-11-02T00:00:00Z"></time><div id="message-content-1">&lt;script&gt;alert(1)&lt;/script&gt;</div></li><li id="chat-messages-123-2"><div id="message-content-2">둘째</div><a href="https://cdn.discordapp.com/attachments/a/file.png">사진</a><a href="https://evil.test/a">evil</a></li><div role="textbox" contenteditable="true" data-slate-editor="true"></div>');
  const snap = run(dom, adapter.snapshot);
  assert.equal(snap.rows.length, 2);
  assert.equal(snap.rows[1].author, '한글 😀');
  assert.equal(snap.rows[0].text, '<script>alert(1)</script>');
  assert.equal(snap.rows[1].attachments.length, 1);
  assert.equal(snap.canSend, true);
});
test('refuses composing into a different channel or overwriting existing web draft', () => {
  const dom = page('<div role="textbox" contenteditable="true">기존 초안</div>');
  assert.throws(() => run(dom, adapter.focusComposer, '/channels/@me/456'), /채널이 변경/);
  assert.throws(() => run(dom, adapter.focusComposer, '/channels/@me/123'), /작성 중/);
  dom.window.document.querySelector('[role="textbox"]').textContent = '';
  assert.equal(run(dom, adapter.focusComposer, '/channels/@me/123'), true);
});
test('login pages have no send target', () => {
  const snap = run(page('<input type="password">', '/login'), adapter.snapshot);
  assert.equal(snap.loggedIn, false);
  assert.equal(snap.canSend, false);
  assert.equal(snap.rows.length, 0);
});
test('desktop app launcher at /channels/@me is not an authenticated session', () => {
  const snap = run(page('<h1>Discord 앱 감지됨</h1><button>앱 열기</button>', '/channels/@me'), adapter.snapshot);
  assert.equal(snap.loggedIn, false);
});
test('watcher skips clean DOM, detects edits and navigation, and honors forced/safety reads', async () => {
  const dom = page('<li id="chat-messages-123-1"><div id="message-content-1">first</div></li><div role="textbox" contenteditable="true"></div>');
  let now = 0;
  dom.window.performance.now = () => now;
  dom.window.eval(`(${adapter.installWatcher.toString()})(${adapter.snapshot.toString()})`);
  const read = force => run(dom, adapter.readWatched, force);
  assert.equal(read(false).rows[0].text, 'first');
  assert.equal(read(false), null, 'idle DOM must not be scraped again');
  dom.window.document.querySelector('[id^="message-content-"]').textContent = 'edited';
  await Promise.resolve();
  assert.equal(read(false).rows[0].text, 'edited');
  assert.equal(read(false), null);
  assert.equal(read(true).rows[0].text, 'edited', 'manual refresh must bypass dirty check');
  dom.window.history.pushState({}, '', '/channels/@me/456');
  assert.equal(read(false).route, '/channels/@me/456');
  assert.equal(read(false), null);
  dom.window.innerWidth += 100;
  assert(read(false), 'viewport changes may change DOM visibility');
  now = 15001;
  assert(read(false), 'periodic safety sweep catches CSS-only changes');
  assert.equal(read(false), null);
  dom.window.__discordCodeReader.dispose();
  dom.window.close();
});
