// Manual smoke run: node test/smoke.cjs. Does not sign in or send messages.
const { _electron } = require('playwright');
const path = require('node:path');
(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const application = await _electron.launch({ args: [path.join(__dirname, 'login-harness.cjs')], env });
  const errors = [];
  try {
    const page = await application.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('#raw');
    await page.locator('#raw').click();
    await page.screenshot({ path: '/tmp/discord-code-shell.png' });
    const info = await application.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const view = win.contentView.children.find(child => child.webContents);
      return { title: win.title, guest: view.webContents.getURL(), node: view.webContents.getLastWebPreferences().nodeIntegration, isolated: view.webContents.getLastWebPreferences().contextIsolation };
    });
    if (errors.length) throw Error(errors.join('\n'));
    if (info.node || !info.isolated) throw Error('Remote content isolation failed');
    console.log(JSON.stringify({ ...info, shellErrors: errors, screenshot: '/tmp/discord-code-shell.png' }));
  } finally { await application.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
