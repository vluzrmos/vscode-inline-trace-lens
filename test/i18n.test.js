'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const { create, normalize, messages } = require('../media/i18n');
const host = require('../src/core/i18n');
const { relativeTime } = require('../src/core/parsers');

test('idiomas, fallback, placeholders e termos Git preservados', () => {
  assert.equal(normalize('pt-br'), 'pt-BR'); assert.equal(normalize('es-MX'), 'es');
  assert.equal(normalize('en-GB'), 'en'); assert.equal(normalize('de'), 'en');
  assert.equal(create('pt-BR')('Você'), 'Você'); assert.equal(create('es')('Você'), 'Tú'); assert.equal(create('en')('Você'), 'You');
  assert.equal(create('en')('{count} arquivos alterados', { count: 3 }), '3 changed files');
  for (const [key, values] of Object.entries(messages)) {
    assert.equal(values.length, 2);
    for (const value of values) {
      assert.ok(value.length);
      assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), (key.match(/\{\w+\}/g) || []).sort());
      for (const term of ['commit', 'branch', 'merge', 'blame', 'diff', 'HEAD', 'fetch']) {
        if (key.toLowerCase().includes(term.toLowerCase())) assert.ok(value.toLowerCase().includes(term.toLowerCase()), `${key}: ${term}`);
      }
    }
  }
  assert.equal(relativeTime(0, 86400000, 'en'), '1 day ago');
  assert.equal(relativeTime(0, 86400000, 'es'), 'hace 1 día');
  assert.equal(relativeTime(0, 86400000, 'pt-BR'), 'há 1 dia');
});

test('manifesto possui todas as traduções nativas', () => {
  const pkg = JSON.stringify(require('../package.json'));
  const keys = [...pkg.matchAll(/%([^%]+)%/g)].map(match => match[1]);
  for (const filename of ['package.nls.json', 'package.nls.es.json', 'package.nls.pt-br.json', 'package.nls.pt.json']) {
    const bundle = require('../' + filename);
    for (const key of keys) assert.ok(bundle[key], `${filename}: ${key}`);
  }
});

test('HTML do grafo usa idioma selecionado, texto e catálogo da webview', () => {
  const filename = path.resolve(__dirname, '../src/features/graph.js');
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, require: name => name === 'vscode' ? { Uri: { joinPath: (_, ...parts) => parts.join('/') } } : localRequire(name)
  });
  try {
    for (const [configured, editor, expected, label] of [['auto', 'es-MX', 'es', 'Descripción'], ['auto', 'en', 'en', 'Description'], ['pt-BR', 'en', 'pt-BR', 'Descrição']]) {
      host.configure(configured, editor);
      const html = module.exports.GraphFeature.prototype.html.call({ context: {} }, { cspSource: 'https://test.invalid', asWebviewUri: value => value });
      assert.ok(html.includes(`lang="${expected}"`)); assert.ok(html.includes(`>${label}<`));
      assert.ok(html.includes('media/i18n.js')); assert.ok(!html.includes('${t('));
    }
  } finally { host.configure('pt-BR'); }
});
