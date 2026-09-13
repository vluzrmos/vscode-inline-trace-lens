'use strict';
const { t, getLanguage } = require('../core/i18n');

const vscode = require('vscode');
const path = require('node:path');
const { relativeTime } = require('../core/parsers');

function cursorLines(editor) {
  return [...new Set(editor.selections.map(selection => selection.active.line))].sort((a, b) => a - b);
}

class BlameFeature {
  constructor(git, output) {
    this.git = git; this.output = output; this.cache = new Map(); this.disposables = [];
    this.changed = new vscode.EventEmitter();
    this.onDidChangeInlayHints = this.changed.event;
    this.decoration = vscode.window.createTextEditorDecorationType({
      after: { margin: '0 0 0 2em', color: new vscode.ThemeColor('inlinetracelens.blameForeground'),
        backgroundColor: 'transparent', fontStyle: 'italic' },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
    this.disposables.push(this.changed,
      this.decoration,
      vscode.languages.registerInlayHintsProvider({ scheme: 'file' }, this),
      vscode.window.onDidChangeTextEditorSelection(e => {
        if (e.textEditor === vscode.window.activeTextEditor) { this.changed.fire(); this.render(); }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => { this.changed.fire(); this.render(); }),
      vscode.window.onDidChangeVisibleTextEditors(() => this.render()),
      vscode.window.onDidChangeTextEditorVisibleRanges(() => this.render()),
      vscode.workspace.onDidChangeTextDocument(e => this.invalidate(e.document)),
      vscode.workspace.onDidCloseTextDocument(d => this.invalidate(d)),
      vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('inlinetracelens')) this.refresh(); }));
    this.timer = setInterval(() => this.refresh(), 60000);
    this.render();
  }

  invalidate(document) {
    const key = document.uri.toString();
    this.cache.get(key)?.controller.abort();
    this.cache.delete(key);
    clearTimeout(this.debounce);
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document === document) editor.setDecorations(this.decoration, []);
    }
    this.debounce = setTimeout(() => { this.changed.fire(); this.render(); }, 300);
  }

  refresh() {
    for (const item of this.cache.values()) item.controller.abort();
    this.cache.clear(); this.changed.fire(); this.render();
  }

  async provideInlayHints(document, range, token) {
    if (vscode.workspace.getConfiguration('inlinetracelens', document.uri).get('blame.displayMode', 'decoration') !== 'inlay') return [];
    return this.annotations(document, range, token);
  }

  render() {
    const generation = this.generation = (this.generation || 0) + 1;
    for (const editor of vscode.window.visibleTextEditors) {
      const document = editor.document;
      editor.setDecorations(this.decoration, []);
      const config = vscode.workspace.getConfiguration('inlinetracelens', document.uri);
      if (editor !== vscode.window.activeTextEditor || document.uri.scheme !== 'file' ||
          config.get('blame.displayMode', 'decoration') !== 'decoration') continue;
      const version = document.version;
      const lines = cursorLines(editor);
      if (!lines.length) continue;
      const cursorRange = { start: { line: lines[0] }, end: { line: lines[lines.length - 1] } };
      Promise.all([this.annotations(document, cursorRange, { isCancellationRequested: false })])
        .then(groups => {
          if (this.disposed || this.generation !== generation || document.version !== version) return;
          const hints = new Map(groups.flat().map(hint => [hint.position.line, hint]));
          editor.setDecorations(this.decoration, [...hints.values()].map(hint => ({
            range: new vscode.Range(hint.position, hint.position), hoverMessage: hint.tooltip,
            renderOptions: { after: { contentText: hint.label.map(part => part.value).join('').trim() } }
          })));
        }).catch(error => this.output.appendLine(`Blame: ${error.message}`));
    }
  }

  async annotations(document, range, token) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) return [];
    const selectionKey = cursorLines(editor).join(',');
    const selectedLines = cursorLines(editor).filter(line => line >= range.start.line && line <= range.end.line);
    if (!selectedLines.length) return [];
    const config = vscode.workspace.getConfiguration('inlinetracelens', document.uri);
    if (!vscode.workspace.isTrusted || !config.get('blame.enabled', true)) return [];
    const contents = document.getText();
    if (Buffer.byteLength(contents, 'utf8') > config.get('blame.maxFileBytes', 1048576)) return [];
    const key = document.uri.toString();
    let item = this.cache.get(key);
    if (!item || item.version !== document.version) {
      const controller = new AbortController();
      const promise = (async () => {
        const root = await this.git.root(path.dirname(document.uri.fsPath));
        const [lines, email] = await Promise.all([
          this.git.blame(root, document.uri.fsPath, contents, controller.signal),
          this.git.userEmail(root, controller.signal).catch(error => {
            if (!controller.signal.aborted) this.output.appendLine(`${t('Identidade Git')}: ${error.message}`);
            return '';
          })
        ]);
        return { root, lines, email };
      })();
      item = { version: document.version, promise, controller };
      this.cache.set(key, item);
      if (this.cache.size > 20) {
        const oldest = this.cache.keys().next().value;
        this.cache.get(oldest).controller.abort(); this.cache.delete(oldest);
      }
    }
    try {
      const { root, lines, email } = await item.promise;
      if (token.isCancellationRequested || item.version !== document.version ||
          vscode.window.activeTextEditor !== editor || cursorLines(editor).join(',') !== selectionKey) return [];
      const hints = [];
      for (const line of selectedLines) {
        const entry = lines.get(line);
        if (!entry) continue;
        const uncommitted = /^0+$/.test(entry.hash);
        const author = email && entry.email?.trim().toLowerCase() === email.trim().toLowerCase() ? t("Você") : entry.author;
        const text = uncommitted ? t("Você • alterações não commitadas") :
          `${author} • ${relativeTime(entry.timestamp, Date.now(), getLanguage())} • ${entry.subject.slice(0, config.get('blame.messageLength', 64))} • `;
        const label = [new vscode.InlayHintLabelPart(`  ${text.replace(/[\r\n\t]/g, ' ')}`)];
        if (!uncommitted) {
          const hash = new vscode.InlayHintLabelPart(entry.hash.slice(0, 8));
          hash.command = { title: t("Abrir detalhes do commit"), command: 'inlinetracelens.showCommit', arguments: [root, entry.hash] };
          hash.tooltip = t("Abrir commit e arquivos alterados"); label.push(hash);
        }
        const hint = new vscode.InlayHint(document.lineAt(line).range.end, label);
        hint.paddingLeft = true;
        const tooltip = new vscode.MarkdownString();
        tooltip.appendText(uncommitted ? text : `${entry.author}\n${new Date(entry.timestamp * 1000).toLocaleString(getLanguage())}\n\n${entry.subject}\n\n${entry.hash}`);
        if (!uncommitted) {
          const args = encodeURIComponent(JSON.stringify([root, entry.hash]));
          tooltip.appendMarkdown(`\n\n[${entry.hash.slice(0, 8)} — ${t('abrir commit')}](command:inlinetracelens.showCommit?${args})`);
          tooltip.isTrusted = { enabledCommands: ['inlinetracelens.showCommit'] };
        }
        hint.tooltip = tooltip; hints.push(hint);
      }
      return hints;
    } catch (error) {
      if (!item.controller.signal.aborted && !/not a git repository|no such path|no such ref|no such file/i.test(error.message)) {
        this.output.appendLine(`Blame: ${error.message}`);
      }
      return [];
    }
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.debounce); clearInterval(this.timer);
    for (const item of this.cache.values()) item.controller.abort();
    this.disposables.forEach(d => d.dispose());
  }
}

module.exports = { BlameFeature };
