'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Git, assertHash } = require('../src/core/git');
const { layout } = require('../src/core/lanes');
const { parseFiles, relativeTime } = require('../src/core/parsers');

test('Git real: raiz, blame do buffer, rename, merge, refs e paginação estável', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inline-blame-test-'));
  const git = new Git();
  t.after(async () => { git.dispose(); await fs.rm(root, { recursive: true, force: true }); });
  const run = args => git.run(root, args);
  await run(['init', '-b', 'main']); await run(['config', 'user.name', 'Pessoa Teste']); await run(['config', 'user.email', 'test@example.invalid']);
  await run(['config', 'commit.gpgsign', 'false']); await run(['config', 'core.autocrlf', 'false']);
  const empty = await git.snapshot(root); assert.deepEqual(await git.log(root, 0, 10, empty), []);
  await fs.writeFile(path.join(root, 'arquivo ç.txt'), 'primeira\nsegunda\n');
  await run(['add', '.']); await run(['commit', '-m', 'Inicial <script> & acentos']);
  const initial = (await run(['rev-parse', 'HEAD'])).trim();
  const detail = await git.details(root, initial); assert.equal(detail.files[0].status, 'A');
  assert.equal(detail.files[0].path, 'arquivo ç.txt'); assert.equal(detail.parent, undefined);
  const blame = await git.blame(root, path.join(root, 'arquivo ç.txt'), 'nova\nprimeira\nsegunda\n');
  assert.match(blame.get(0).hash, /^0+$/); assert.equal(blame.get(1).hash, initial); assert.equal(blame.get(2).author, 'Pessoa Teste');
  assert.equal(blame.get(1).email, 'test@example.invalid');
  assert.equal(await git.userEmail(root), 'test@example.invalid');
  await run(['config', 'user.email', 'other@example.invalid']);
  assert.equal(await git.userEmail(root), 'other@example.invalid');
  await run(['config', 'user.email', 'test@example.invalid']);
  await run(['update-ref', 'refs/remotes/origin/main', initial]);
  await run(['checkout', '-b', 'feature']);
  await fs.writeFile(path.join(root, 'feature.txt'), 'feature\n'); await run(['add', '.']); await run(['commit', '-m', 'Feature']);
  await run(['checkout', 'main']);
  await run(['mv', 'arquivo ç.txt', 'renomeado ç.txt']); await run(['commit', '-m', 'Renomear']);
  const renamed = (await run(['rev-parse', 'HEAD'])).trim();
  const rename = await git.details(root, renamed); assert.equal(rename.files[0].status, 'R100'); assert.equal(rename.files[0].oldPath, 'arquivo ç.txt');
  assert.equal(await git.content(root, renamed, 'renomeado ç.txt'), 'primeira\nsegunda\n');
  await run(['merge', '--no-ff', 'feature', '-m', 'Merge feature']);
  const snapshot = await git.snapshot(root); const all = await git.log(root, 0, 100, snapshot);
  assert.equal(all.length, 4); assert.equal(all[0].parents.length, 2);
  const merge = await git.details(root, all[0].hash); assert.equal(merge.files[0].path, 'feature.txt');
  assert.ok(all.every(commit => commit.local && commit.current)); assert.equal(all.filter(commit => commit.remote).length, 1);
  const page1 = await git.log(root, 0, 2, snapshot);
  await fs.writeFile(path.join(root, 'new.txt'), 'new'); await run(['add', '.']); await run(['commit', '-m', 'Novo durante paginação']);
  const page2 = await git.log(root, 2, 2, snapshot);
  assert.deepEqual([...page1, ...page2].map(c => c.hash), all.map(c => c.hash));
  await run(['rm', 'renomeado ç.txt']); await run(['commit', '-m', 'Remover']);
  const removed = await git.details(root, (await run(['rev-parse', 'HEAD'])).trim()); assert.equal(removed.files[0].status, 'D');
  await run(['checkout', '--detach', initial]); assert.equal((await git.snapshot(root)).branch, 'HEAD destacado');
  await assert.rejects(git.details(root, '--help'), /inválido/);
});

test('layout mantém ligações de merge através das páginas', () => {
  const commits = [{ hash: 'm', parents: ['a', 'b'] }, { hash: 'a', parents: ['r'] }, { hash: 'b', parents: ['r'] }, { hash: 'r', parents: [] }];
  const full = layout(commits); const first = layout(commits.slice(0, 2)); const last = layout(commits.slice(2), first.lanes);
  assert.deepEqual([...first.rows, ...last.rows], full.rows); assert.deepEqual(last.lanes, []);
  assert.deepEqual(full.rows[0].edges.map(e => e.to), [0, 1]);
  assert.equal(full.rows[2].edges.find(e => e.commit).to, 0);
});

test('paths NUL, validação SHA e tempo relativo', () => {
  assert.deepEqual(parseFiles('R100\0antigo\n.txt\0novo\t.txt\0D\0x\0'), [
    { status: 'R100', oldPath: 'antigo\n.txt', path: 'novo\t.txt' }, { status: 'D', path: 'x', oldPath: 'x' }
  ]);
  assert.throws(() => assertHash('a'.repeat(41))); assert.doesNotThrow(() => assertHash('a'.repeat(64)));
  assert.equal(relativeTime(0, 86400000), 'há 1 dia'); assert.equal(relativeTime(100, 0), 'agora');
});

test('cancelamento interrompe execução', async () => {
  const git = new Git(); const controller = new AbortController(); controller.abort();
  await assert.rejects(git.run(process.cwd(), ['status'], undefined, controller.signal), /cancelada/);
  git.dispose();
});
