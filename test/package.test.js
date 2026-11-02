const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../package.json');
const root = path.join(__dirname, '..');
test('Windows ICO directory contains complete PNG images for native icon sizes', () => {
 const ico=fs.readFileSync(path.join(root,'build/icon.ico'));
 assert.equal(ico.readUInt16LE(2),1); assert.equal(ico.readUInt16LE(4),6);
 for(let i=0;i<6;i++) {
  const entry=6+i*16, length=ico.readUInt32LE(entry+8), offset=ico.readUInt32LE(entry+12);
  assert(offset+length<=ico.length); assert.equal(ico.subarray(offset+1,offset+4).toString(),'PNG');
 }
});
test('Mac ICNS contains all declared icon chunks with valid lengths', () => {
 const icon=fs.readFileSync(path.join(root,'build/icon.icns')); assert.equal(icon.subarray(0,4).toString(),'icns'); assert.equal(icon.readUInt32BE(4),icon.length);
 const types=[]; let offset=8;
 while(offset<icon.length){ types.push(icon.subarray(offset,offset+4).toString()); const length=icon.readUInt32BE(offset+4); assert(length>8);offset+=length; }
 assert.equal(offset,icon.length); assert(types.includes('ic10')); assert(types.includes('icp4'));
});
test('both platforms package installers and preserve the existing app identity', () => {
 assert.equal(config.build.appId,'local.discord-code'); assert.equal(config.productName,'Discord Code');
 assert.equal(config.build.win.target,'nsis'); assert.equal(config.build.mac.target,'dmg');
 assert(config.build.win.artifactName.includes('${arch}')); assert(config.build.mac.artifactName.includes('${arch}'));
 assert(config.build.files.includes('assets/icon.png'));
});
