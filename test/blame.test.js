'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('blame nos cursores: navegação, multicursor, deduplicação, hash, cache e edição', async () => {
  const disposable = () => ({ dispose() {} });
  const settings = { 'blame.enabled': true, 'blame.displayMode': 'inlay' };
  let decorationStyle;
  const editors = [];
  let selectionChanged;
  let activeChanged;
  const vscode = {
    ThemeColor: class { constructor(id) { this.id = id; } },
    Range: class { constructor(start, end) { this.start = start; this.end = end; } },
    DecorationRangeBehavior: { ClosedClosed: 1 },
    window: { visibleTextEditors: editors, createTextEditorDecorationType: style => { decorationStyle = style; return disposable(); },
      onDidChangeTextEditorSelection: listener => { selectionChanged = listener; return disposable(); },
      onDidChangeActiveTextEditor: listener => { activeChanged = listener; return disposable(); },
      onDidChangeVisibleTextEditors: disposable, onDidChangeTextEditorVisibleRanges: disposable },
    EventEmitter: class { constructor() { this.event = () => disposable(); } fire() {} dispose() {} },
    InlayHintLabelPart: class { constructor(value) { this.value = value; } },
    InlayHint: class { constructor(position, label) { this.position = position; this.label = label; } },
    MarkdownString: class { appendText(text) { this.text = text; } appendMarkdown(text) { this.markdown = text; } },
    languages: { registerInlayHintsProvider: disposable },
    workspace: {
      isTrusted: true, getConfiguration: () => ({ get: (key, fallback) => settings[key] ?? fallback }),
      onDidChangeTextDocument: disposable, onDidCloseTextDocument: disposable, onDidChangeConfiguration: disposable
    }
  };
  const module = { exports: {} };
  const filename = path.join(__dirname, '../src/features/blame.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, require: name => name === 'vscode' ? vscode : name === '../core/i18n' ? require('../src/core/i18n') : name === '../core/parsers' ? require('../src/core/parsers') : require(name),
    Buffer, AbortController, setTimeout, clearTimeout, setInterval, clearInterval
  }, { filename });
  let calls = 0; let buffer;
  const hash = 'a'.repeat(40);
  let userEmail = 'autor@example.invalid';
  let emailCalls = 0;
  const git = { root: async () => '/repo', userEmail: async root => { assert.equal(root, '/repo'); emailCalls++; return userEmail; }, blame: async (root, name, contents) => {
    calls++; buffer = contents;
    return new Map([[0, { hash, author: 'Autor', email: 'autor@example.invalid', timestamp: 100, subject: '<script>texto</script>' }],
      [1, { hash: '0'.repeat(40), author: '', timestamp: 0, subject: '' }]]);
  } };
  const provider = new module.exports.BlameFeature(git, { appendLine: () => {} });
  try {
    let contents = 'linha 1\nlinha 2';
    const document = { uri: { scheme: 'file', fsPath: '/repo/file', toString: () => 'file:///repo/file' }, version: 1,
      getText: () => contents, lineCount: 2, lineAt: line => ({ range: { end: { line, character: 7 } } }) };
    const range = { start: { line: 0 }, end: { line: 1 } };
    let decorations;
    const editor = { document, selection: { active: { line: 0 } },
      get selections() { return this.multipleSelections || [this.selection]; },
      visibleRanges: [range], setDecorations: (type, values) => { decorations = values; } };
    editors.push(editor); vscode.window.activeTextEditor = editor;
    const token = { isCancellationRequested: false };
    const hints = await provider.provideInlayHints(document, range, token);
    assert.equal(hints.length, 1); assert.equal(hints[0].position.line, 0); assert.equal(hints[0].label[1].value, hash.slice(0, 8));
    assert.match(hints[0].label[0].value, /Você •/);
    assert.match(hints[0].tooltip.text, /^Autor\n/);
    assert.equal(hints[0].label[1].command.command, 'inlinetracelens.showCommit');
    assert.equal(hints[0].label[1].command.arguments[1], hash);
    assert.equal(hints[0].tooltip.isTrusted.enabledCommands.join(','), 'inlinetracelens.showCommit');
    assert.match(hints[0].tooltip.markdown, /command:inlinetracelens.showCommit/);
    editor.selection.active.line = 1; selectionChanged({ textEditor: editor });
    const moved = await provider.provideInlayHints(document, range, token);
    assert.equal(moved.length, 1); assert.equal(moved[0].position.line, 1);
    assert.equal(moved[0].label.length, 1); assert.match(moved[0].label[0].value, /não commitadas/);
    assert.equal(moved[0].tooltip.isTrusted, undefined);
    assert.equal((await provider.provideInlayHints(document, { start: { line: 0 }, end: { line: 0 } }, token)).length, 0);
    editor.selection.active.line = 0;
    await provider.provideInlayHints(document, range, token); assert.equal(calls, 1);
    assert.equal(emailCalls, 1);
    document.version++; contents = 'novo\nconteúdo'; provider.invalidate(document);
    await provider.provideInlayHints(document, range, token); assert.equal(calls, 2); assert.equal(buffer, contents);
    token.isCancellationRequested = true;
    assert.equal((await provider.provideInlayHints(document, range, token)).length, 0);
    token.isCancellationRequested = false; settings['blame.enabled'] = false;
    assert.equal((await provider.provideInlayHints(document, range, token)).length, 0);
    settings['blame.enabled'] = true; vscode.workspace.isTrusted = false;
    assert.equal((await provider.provideInlayHints(document, range, token)).length, 0);
    vscode.workspace.isTrusted = true; settings['blame.displayMode'] = 'decoration';
    provider.render();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(decorations.length, 1);
    assert.equal(decorationStyle.after.backgroundColor, 'transparent');
    assert.equal(decorationStyle.after.color.id, 'inlinetracelens.blameForeground');
    assert.match(decorations[0].renderOptions.after.contentText, /aaaaaaaa/);
    assert.equal((await provider.provideInlayHints(document, range, token)).length, 0);
    editor.selection.active.line = 1; selectionChanged({ textEditor: editor });
    assert.equal(decorations.length, 0);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(decorations.length, 1); assert.equal(decorations[0].range.start.line, 1);
    editor.multipleSelections = [{ active: { line: 1 } }, { active: { line: 0 } }, { active: { line: 1 } }];
    selectionChanged({ textEditor: editor });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(decorations.length, 2);
    assert.equal(decorations.map(d => d.range.start.line).join(','), '0,1');
    settings['blame.displayMode'] = 'inlay';
    const multipleHints = await provider.provideInlayHints(document, range, token);
    assert.equal(multipleHints.length, 2);
    assert.equal(multipleHints.map(hint => hint.position.line).join(','), '0,1');
    const restrictedHints = await provider.provideInlayHints(document, { start: { line: 1 }, end: { line: 1 } }, token);
    assert.equal(restrictedHints.length, 1); assert.equal(restrictedHints[0].position.line, 1);
    // Changing cursors during a pending request must discard its stale annotations.
    const pending = provider.provideInlayHints(document, range, token);
    editor.multipleSelections = undefined;
    assert.equal((await pending).length, 0);
    settings['blame.displayMode'] = 'decoration';
    selectionChanged({ textEditor: editor });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(decorations.length, 1);
    // Rapid movement must not let an older asynchronous result restore the old line.
    editor.selection.active.line = 0; selectionChanged({ textEditor: editor });
    editor.selection.active.line = 1; selectionChanged({ textEditor: editor });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(decorations.length, 1); assert.equal(decorations[0].range.start.line, 1);
    vscode.window.activeTextEditor = undefined; activeChanged();
    assert.equal(decorations.length, 0);
    settings['blame.displayMode'] = 'inlay';
    assert.equal((await provider.provideInlayHints(document, range, token)).length, 0);
    provider.invalidate(document); assert.equal(decorations.length, 0);
    vscode.window.activeTextEditor = editor; editor.selection.active.line = 0;
    for (const [email, expected] of [['outro@example.invalid', 'Autor'], ['', 'Autor'], [' AUTOR@EXAMPLE.INVALID ', 'Você']]) {
      userEmail = email; provider.invalidate(document);
      const result = await provider.provideInlayHints(document, range, token);
      assert.ok(result[0].label[0].value.trim().startsWith(expected + ' •'));
    }
  } finally { provider.dispose(); }
});
