// Live login regression: checks for fields only. Never enters credentials or submits login.
const { _electron } = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
 const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
 const app = await _electron.launch({ args: [path.join(__dirname, 'login-harness.cjs')], env });
 try {
  await app.firstWindow();
  let result;
  for (let i = 0; i < 40; i++) {
   result = await app.evaluate(async ({ BrowserWindow }) => {
    const guest = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents).webContents;
    try { return await guest.executeJavaScript(`({path: location.pathname, fields: document.querySelectorAll('input[name=email],input[name=password]').length, appLauncher: /Discord 앱 감지됨|Discord App Detected/.test(document.body.innerText)})`); } catch { return {}; }
   });
   if (result.fields === 2 || result.appLauncher) break;
   await new Promise(resolve => setTimeout(resolve, 500));
  }
  console.log('LOGIN_SCREEN', result);
  assert.equal(result.path, '/login');
  assert.equal(result.fields, 2, 'Fresh app must open the login form instead of the Discord desktop launcher');
  console.log('PASS: fresh app opens live Discord email/password login form');
 } finally { await app.close(); }
})().catch(e=>{ console.error(e);process.exitCode=1;});
