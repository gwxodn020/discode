const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
(async () => {
 const directory = path.join(__dirname, '../dist');
 const files = (await fs.readdir(directory)).filter(name => /\.(dmg|exe)$/.test(name)).sort();
 if (!files.length) throw Error('No installers found in dist/');
 const lines = await Promise.all(files.map(async name => crypto.createHash('sha256').update(await fs.readFile(path.join(directory, name))).digest('hex') + '  ' + name));
 const suffix = process.env.BUILD_ARCH || process.arch;
 await fs.writeFile(path.join(directory, `SHA256SUMS-${process.platform}-${suffix}.txt`), lines.join('\n') + '\n');
 console.log(lines.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });
