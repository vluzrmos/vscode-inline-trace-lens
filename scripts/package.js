'use strict';
// Small ZIP writer using only Node standard library; no package download at build time.
const fs = require('node:fs');
const path = require('node:path');
const { deflateRawSync } = require('node:zlib');
const pkg = require('../package.json');
const defaultMessages = require('../package.nls.json');
const description = defaultMessages[pkg.description.replace(/^%|%$/g, '')] || pkg.description;
const escape = value => String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
const files = [];
function add(name, content) { files.push({ name, content: Buffer.from(content) }); }
for (const folder of ['src', 'media']) {
  for (const entry of fs.readdirSync(path.join(__dirname, '..', folder), { recursive: true })) {
    const filename = path.join(__dirname, '..', folder, entry);
    if (fs.statSync(filename).isFile()) add(`extension/${folder}/${entry.replace(/\\/g, '/')}`, fs.readFileSync(filename));
  }
}
for (const file of ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md']) add(`extension/${file}`, fs.readFileSync(path.join(__dirname, '..', file)));
for (const file of fs.readdirSync(path.join(__dirname, '..')).filter(name => /^package\.nls(?:\.[\w-]+)?\.json$/.test(name))) {
  add(`extension/${file}`, fs.readFileSync(path.join(__dirname, '..', file)));
}
add('[Content_Types].xml', `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="svg" ContentType="image/svg+xml"/><Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="css" ContentType="text/css"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Default Extension="xml" ContentType="text/xml"/><Default Extension="" ContentType="text/plain"/></Types>`);
add('extension.vsixmanifest', `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
<Metadata><Identity Language="en-US" Id="${escape(pkg.name)}" Version="${escape(pkg.version)}" Publisher="${escape(pkg.publisher)}"/><DisplayName>${escape(pkg.displayName)}</DisplayName><Description xml:space="preserve">${escape(description)}</Description><Tags>git,blame,graph</Tags><Categories>SCM Providers,Other</Categories><GalleryFlags>Public</GalleryFlags><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${escape(pkg.engines.vscode)}"/><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/><Property Id="Microsoft.VisualStudio.Code.ExecutesCode" Value="true"/></Properties><Icon>extension/${escape(pkg.icon)}</Icon><License>extension/LICENSE</License></Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/${escape(pkg.icon)}" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Changelog" Path="extension/CHANGELOG.md" Addressable="true"/></Assets></PackageManifest>`);
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
const chunks = []; const central = []; let offset = 0;
for (const file of files) {
  const name = Buffer.from(file.name); const compressed = deflateRawSync(file.content); const crc = crc32(file.content);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8);
  header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(file.content.length, 22); header.writeUInt16LE(name.length, 26);
  chunks.push(header, name, compressed);
  const directory = Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
  directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(8, 10); directory.writeUInt16LE(33, 14);
  directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(file.content.length, 24);
  directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42); central.push(directory, name);
  offset += header.length + name.length + compressed.length;
}
const directory = Buffer.concat(central); const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
const target = path.join(__dirname, '..', 'dist', `${pkg.name}-${pkg.version}.vsix`);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, Buffer.concat([...chunks, directory, end]));
console.log(target);
