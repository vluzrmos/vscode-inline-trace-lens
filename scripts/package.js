'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createVSIX } = require('@vscode/vsce');
const pkg = require('../package.json');

const root = path.resolve(__dirname, '..');

async function packageExtension() {
  const filename = `${pkg.name}-${pkg.version}.vsix`;
  const targetPath = path.join(root, 'dist', filename);
  
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  await createVSIX({
    cwd: root,
    packagePath: targetPath,
    githubBranch: 'main',
    dependencies: false,
    useYarn: false
  });
  console.log(targetPath);
}

packageExtension().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
