// Fresh disposable profile; exercises the real app without touching the user's session.
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'discord-code-login-')));
require('../main');
