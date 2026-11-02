const { _electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
(async () => {
 const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
 const arch = process.env.BUILD_ARCH || process.arch;
 const target = process.platform === 'darwin'
  ? path.join('dist', arch === 'arm64' ? 'mac-arm64' : 'mac', 'Discord Code.app', 'Contents', 'MacOS', 'Discord Code')
  : path.join('dist', arch === 'arm64' ? 'win-arm64-unpacked' : 'win-unpacked', 'Discord Code.exe');
 if (!['darwin', 'win32'].includes(process.platform)) throw Error('Packaged smoke requires macOS or Windows');
 const application = await _electron.launch({ executablePath: path.resolve(target), args: ['--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'discord-code-packaged-'))], env, timeout: 30000 });
 try {
  await application.firstWindow({ timeout: 15000 });
  await new Promise(resolve => setTimeout(resolve, 1500));
  console.log(await application.evaluate(({ BrowserWindow, app }) => ({ appPath: app.getAppPath(), pages: BrowserWindow.getAllWindows().map(w => w.webContents.getURL()) })));
  const page = application.context().pages().find(p => p.url().startsWith('file:'));
  if (!page) throw Error('Packaged shell did not load');
  await page.waitForSelector('#raw');
  const before = await page.locator('#raw').getAttribute('aria-label');
  await page.locator('#raw').click();
  await page.waitForFunction(value => document.querySelector('#raw').getAttribute('aria-label') !== value, before);
  const iconsLoaded = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px codicon'); });
  if (!iconsLoaded) throw Error('Packaged Codicons font is missing');
  console.log('PASS: packaged app launches, Codicons font loads, preload IPC toggles code view');
 } finally { await application.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
