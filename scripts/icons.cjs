// Deterministic native icon exports from the generated source artwork.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.join(__dirname, '..');
(async () => {
 await fs.mkdir(path.join(root, 'build'), { recursive: true });
 const source = path.join(root, 'assets/icon-source.png');
 const png = size => sharp(source).resize(size, size, { fit: 'contain', background: '#00000000' }).png().toBuffer();
 await fs.writeFile(path.join(root, 'assets/icon.png'), await png(1024));
 const sizes = [16, 32, 48, 64, 128, 256];
 const images = await Promise.all(sizes.map(png));
 const directory = Buffer.alloc(6 + sizes.length * 16);
 directory.writeUInt16LE(1, 2); directory.writeUInt16LE(sizes.length, 4);
 let offset = directory.length;
 images.forEach((image, i) => {
  const entry = 6 + i * 16;
  directory[entry] = sizes[i] === 256 ? 0 : sizes[i]; directory[entry + 1] = directory[entry];
  directory.writeUInt16LE(1, entry + 4); directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(image.length, entry + 8); directory.writeUInt32LE(offset, entry + 12); offset += image.length;
 });
 await fs.writeFile(path.join(root, 'build/icon.ico'), Buffer.concat([directory, ...images]));
 const chunks = [];
 for (const [type, size] of [['icp4',16],['icp5',32],['icp6',64],['ic07',128],['ic08',256],['ic09',512],['ic10',1024]]) {
  const image = await png(size); const header = Buffer.alloc(8);
  header.write(type, 0, 'ascii'); header.writeUInt32BE(image.length + 8, 4); chunks.push(header, image);
 }
 const header = Buffer.alloc(8); header.write('icns'); header.writeUInt32BE(chunks.reduce((n,b)=>n+b.length,8),4);
 await fs.writeFile(path.join(root, 'build/icon.icns'), Buffer.concat([header, ...chunks]));
 console.log('Created assets/icon.png, build/icon.ico, build/icon.icns');
})().catch(error => { console.error(error); process.exitCode = 1; });
