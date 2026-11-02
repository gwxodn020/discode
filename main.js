const { app, BrowserWindow, WebContentsView, ipcMain, shell } = require('electron');
const path = require('node:path');
const { allowed, route } = require('./model');
const adapter = require('./adapter');
let win, discord, timer, polling = false, sending = false, raw = true, last = '', sidebarOpen = true, forceNext = true;
const run = (fn, ...args) => discord.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { win?.show(); win?.focus(); });
  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('local.discord-code');
    if (!app.isPackaged) app.dock?.setIcon(path.join(__dirname, 'assets/icon.png'));
    create();
  });
}
function layout() {
  if (!win || !discord) return;
  const [width, height] = win.getContentSize();
  const left = sidebarOpen ? 298 : 48;
  discord.setBounds({ x: left, y: 92, width: Math.max(100, width - left), height: Math.max(100, height - 114) });
  discord.setVisible(raw);
}
function guard(contents) {
  contents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  contents.on('will-navigate', (event, url) => { if (!allowed(url)) { event.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  contents.on('will-redirect', (event, url) => { if (!allowed(url)) event.preventDefault(); });
}
function create() {
  win = new BrowserWindow({ width: 1380, height: 900, minWidth: 850, minHeight: 580, backgroundColor: '#1f1f1f', icon: path.join(__dirname, 'assets/icon.png'), title: 'Discord Code', titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 11 }, titleBarOverlay: process.platform !== 'darwin' ? { color: '#181818', symbolColor: '#cccccc', height: 35 } : false, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.setMenuBarVisibility(false);
  discord = new WebContentsView({ webPreferences: { partition: 'persist:discord-code', contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.contentView.addChildView(discord);
  guard(discord.webContents);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  discord.webContents.session.setPermissionRequestHandler((_wc, _permission, done) => done(false));
  discord.webContents.session.setPermissionCheckHandler(() => false);
  win.loadFile(path.join(__dirname, 'ui/index.html'));
  // The channels landing page offers to open the official desktop app before login.
  // Open the web login directly; Discord restores authenticated sessions itself.
  discord.webContents.loadURL('https://discord.com/login');
  layout();
  win.on('resize', layout);
  win.on('closed', () => { clearTimeout(timer); discord.webContents.close(); discord = null; win = null; });
  win.on('minimize', () => { discord.webContents.setBackgroundThrottling(true); schedulePoll(); });
  win.on('restore', () => { discord.webContents.setBackgroundThrottling(false); poll(true); schedulePoll(); });
  win.on('focus', () => { poll(true); schedulePoll(); });
  win.on('blur', schedulePoll);
  schedulePoll();
}
function schedulePoll() {
  clearTimeout(timer);
  if (!win) return;
  const delay = win.isMinimized() ? 5000 : win.isFocused() ? 750 : 1500;
  timer = setTimeout(async () => {
    try { await poll(); } finally { if (win) schedulePoll(); }
  }, delay);
}
async function poll(force = false) {
  if (force) forceNext = true;
  if (polling || sending || !win || !discord || discord.webContents.isLoadingMainFrame()) return;
  polling = true;
  try {
    if (!allowed(discord.webContents.getURL())) return;
    let state = await run(adapter.readWatched, forceNext);
    if (state?.installWatcher) {
      await discord.webContents.executeJavaScript(`(${adapter.installWatcher.toString()})(${adapter.snapshot.toString()})`);
      state = await run(adapter.readWatched, true);
    }
    forceNext = false;
    if (!state) return;
    const json = JSON.stringify(state);
    if (json !== last) { last = json; win?.webContents.send('state', state); }
  } catch (error) { win?.webContents.send('notice', '화면을 읽는 중입니다. 원본 화면에서 로그인·채널 상태를 확인해 주세요.'); }
  finally { polling = false; }
}
function handle(name, callback) {
  ipcMain.handle(name, async (event, ...args) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('허용되지 않은 요청입니다.');
    return callback(...args);
  });
}
handle('sidebar', value => { sidebarOpen = !!value; layout(); });
handle('raw', value => { raw = !!value; layout(); return raw; });
handle('navigate', async value => {
  if (sending) throw new Error('전송 확인 중에는 채널을 바꿀 수 없습니다.');
  const target = route(value);
  // Prefer Discord's own client-side navigation so the server's last channel is restored.
  const clicked = await discord.webContents.executeJavaScript(`(() => { const target = ${JSON.stringify(target)}; const a = [...document.querySelectorAll('a[href]')].find(a => a.getAttribute('href') === target); if (a) { a.click(); return true; } const parts = target.split('/'); const id = parts.length === 3 && /^[0-9]+$/.test(parts[2]) ? parts[2] : null; const button = id && document.querySelector('[data-list-item-id="guildsnav___' + id + '"]'); if (button) { button.click(); return true; } return false; })()`);
  if (!clicked) await discord.webContents.loadURL('https://discord.com' + target);
  last = '';
});
handle('refresh', () => { last = ''; return poll(true); });
handle('older', expected => run(adapter.older, route(expected)));
handle('external', url => { if (allowed(url) && /^https:\/\/discord\.com\/channels\//.test(url)) return shell.openExternal(url); });
handle('send', async ({ target, text }) => {
  route(target);
  if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw new Error('메시지는 1~2000자로 입력해 주세요.');
  if (sending) throw new Error('이전 메시지를 확인 중입니다.');
  sending = true;
  try {
    const before = await run(adapter.snapshot);
    if (before.route !== target || !before.canSend) throw new Error('현재 채널을 다시 확인해 주세요.');
    const ids = new Set(before.rows.map(row => row.id));
    await run(adapter.focusComposer, target);
    await discord.webContents.insertText(text);
    const prepared = await run(adapter.snapshot);
    if (prepared.route !== target) throw new Error('채널이 변경되었습니다. 원본 화면에서 초안을 확인해 주세요.');
    discord.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    discord.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
    for (let i = 0; i < 12; i++) {
      await pause(500);
      const next = await run(adapter.snapshot);
      if (next.route !== target) break;
      if (!next.composerText.trim() && next.rows.some(row => !ids.has(row.id) && row.text === text)) {
        last = ''; return { observed: true };
      }
    }
    return { observed: false };
  } catch (error) {
    // The caller preserves the draft and blocks retries until the original page is checked.
    return { observed: false, error: error.message };
  } finally { sending = false; poll(true); }
});
app.on('window-all-closed', () => app.quit());
