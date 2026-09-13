'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
for (const folder of ['src', 'media', 'scripts', 'test']) {
  for (const entry of fs.readdirSync(folder, { recursive: true })) {
    if (entry.endsWith('.js')) execFileSync(process.execPath, ['--check', path.join(folder, entry)], { stdio: 'inherit' });
  }
}
JSON.parse(fs.readFileSync('package.json', 'utf8'));
console.log('Sintaxe JavaScript e manifesto válidos.');
