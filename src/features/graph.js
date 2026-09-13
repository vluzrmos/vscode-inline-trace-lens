'use strict';
const { t, getLanguage } = require('../core/i18n');

const vscode = require('vscode');
const crypto = require('node:crypto');
const path = require('node:path');
const { layout } = require('../core/lanes');
const { assertHash } = require('../core/git');

class GraphFeature {
  constructor(context, git, output) {
    this.context = context; this.git = git; this.output = output; this.panels = new Map();
    this.documents = new Map();
    this.provider = vscode.workspace.registerTextDocumentContentProvider('inlinetracelens', {
      provideTextDocumentContent: uri => this.documents.get(uri.toString()) || ''
    });
  }

  async chooseRoot() {
    const dirs = new Set((vscode.workspace.workspaceFolders || []).filter(f => f.uri.scheme === 'file').map(f => f.uri.fsPath));
    const active = vscode.window.activeTextEditor?.document.uri;
    if (active?.scheme === 'file') dirs.add(path.dirname(active.fsPath));
    const roots = new Set();
    for (const dir of dirs) {
      try { roots.add(await this.git.root(dir)); } catch (error) { this.output.appendLine(`${t('Repositório')}: ${error.message}`); }
    }
    if (!roots.size) throw new Error(t("Abra uma pasta Git ou um arquivo de um repositório. Verifique se Git está instalado."));
    if (roots.size === 1) return [...roots][0];
    const selected = await vscode.window.showQuickPick([...roots].map(root => ({ label: path.basename(root), description: root, root })), { placeHolder: t("Selecionar repositório") });
    return selected?.root;
  }

  async open(root, focusHash) {
    if (!vscode.workspace.isTrusted) throw new Error(t("Confie no workspace para usar o Git."));
    root = root || await this.chooseRoot();
    if (!root) return;
    if (focusHash) assertHash(focusHash);
    let state = this.panels.get(root);
    if (state) {
      state.panel.reveal();
      if (focusHash) await this.sendDetails(state, focusHash);
      return;
    }
    const panel = vscode.window.createWebviewPanel('inlinetracelens', `InlineTraceLens • ${path.basename(root)}`, vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')] });
    state = { panel, root, rows: [], lanes: [], loaded: new Set(), details: new Map(), busy: false, focusHash };
    this.panels.set(root, state);
    panel.onDidDispose(() => this.panels.delete(root));
    panel.webview.onDidReceiveMessage(async message => {
      try {
        if (!message || typeof message !== 'object') return;
        if (message.type === 'ready' || message.type === 'refresh') await this.load(state, true);
        else if (message.type === 'more') await this.load(state, false);
        else if (message.type === 'details' && state.loaded.has(message.hash)) await this.sendDetails(state, message.hash);
        else if (message.type === 'file') {
          const details = state.details.get(message.hash);
          if (details && Number.isInteger(message.index) && details.files[message.index]) await this.openDiff(state.root, details, details.files[message.index]);
        }
      } catch (error) {
        this.output.appendLine(error.stack || error.message);
        void panel.webview.postMessage({ type: 'error', message: error.message });
      }
    });
    panel.webview.html = this.html(panel.webview);
  }

  async load(state, reset) {
    if (state.busy) return;
    state.busy = true;
    try {
      if (reset || !state.snapshot) {
        state.snapshot = await this.git.snapshot(state.root);
        state.rows = []; state.lanes = []; state.loaded.clear(); state.details.clear();
      }
      const count = vscode.workspace.getConfiguration('inlinetracelens').get('graph.pageSize', 200);
      const commits = await this.git.log(state.root, state.rows.length, count + 1, state.snapshot);
      const next = layout(commits.slice(0, count), state.lanes);
      state.lanes = next.lanes; state.rows.push(...next.rows);
      next.rows.forEach(row => state.loaded.add(row.hash));
      await state.panel.webview.postMessage({ type: 'commits', reset, rows: next.rows, more: commits.length > count,
        branch: state.snapshot.branch, root: state.root });
      if (state.focusHash) { const hash = state.focusHash; state.focusHash = undefined; await this.sendDetails(state, hash); }
    } finally {
      state.busy = false;
      if (state.reloadLanguage) { state.reloadLanguage = false; state.panel.webview.html = this.html(state.panel.webview); }
    }
  }

  async sendDetails(state, hash) {
    const details = await this.git.details(state.root, hash);
    state.details.set(hash, details);
    await state.panel.webview.postMessage({ type: 'details', ...details });
  }

  async openDiff(root, details, file) {
    if (file.status[0] === 'T') {
      void vscode.window.showInformationMessage(t("Mudança de tipo de arquivo. O diff textual pode não representar links simbólicos ou submódulos."));
    }
    const before = details.parent && file.status[0] !== 'A' ? await this.git.content(root, details.parent, file.oldPath) : '';
    const after = file.status[0] !== 'D' ? await this.git.content(root, details.hash, file.path) : '';
    if (before.includes('\0') || after.includes('\0')) {
      void vscode.window.showInformationMessage(t("Arquivo binário: diff textual indisponível.")); return;
    }
    const makeUri = (revision, filename, text) => {
      const uri = vscode.Uri.from({ scheme: 'inlinetracelens', path: '/' + filename,
        query: new URLSearchParams({ root, revision }).toString() });
      this.documents.set(uri.toString(), text); return uri;
    };
    const left = makeUri(details.parent || 'empty', file.oldPath, before);
    const right = makeUri(details.hash, file.path, after);
    await vscode.commands.executeCommand('vscode.diff', left, right, `${file.path} (${details.hash.slice(0, 8)})`, { preview: true });
  }

  refresh() {
    for (const state of this.panels.values()) this.load(state, true).catch(error => {
      void state.panel.webview.postMessage({ type: 'error', message: error.message });
    });
  }

  reloadLanguage() {
    for (const state of this.panels.values()) {
      if (state.busy) state.reloadLanguage = true;
      else state.panel.webview.html = this.html(state.panel.webview);
    }
  }

  html(webview) {
    const nonce = crypto.randomBytes(24).toString('base64');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'graph.js'));
    const translations = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'i18n.js'));
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'graph.css'));
    return `<!DOCTYPE html><html lang="${getLanguage()}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource};">
      <style nonce="${nonce}" id="graph-layout"></style>
      <link rel="stylesheet" href="${css}"><title>InlineTraceLens · Git Graph</title></head><body>
      <header><div class="identity"><span class="brand">InlineTraceLens</span><span class="divider">/</span><strong>Git Graph</strong></div>
      <div class="actions"><input id="search" type="search" aria-label="${t("Buscar nos commits carregados")}" placeholder="${t("Buscar commit, autor ou branch…")}"><button id="refresh" title="${t("Atualizar histórico (Ctrl/Cmd+R)")}">${t("↻ Atualizar")}</button></div></header>
      <div class="toolbar"><span id="repository"></span><span id="count"></span></div>
      <p class="legend"><span>${t("Histórico completo")}</span><span title="${t("Alcançável a partir de HEAD")}">${t("● Atual")}</span><span title="${t("Alcançável por branches locais")}">${t("● Local")}</span><span title="${t("Referências remotas do último fetch feito pelo usuário")}">${t("● Remoto")}</span></p>
      <p id="status" role="status" aria-live="polite">${t("Carregando histórico…")}</p>
      <section id="focus" aria-label="${t("Commit selecionado")}"></section>
      <div class="table-scroll"><table><thead><tr><th class="graph-heading">${t("Grafo")}</th><th>${t("Descrição")}</th><th class="scope-heading">${t("Presença")}</th><th class="author-heading">${t("Autor")}</th><th class="date-heading">${t("Data")}</th><th class="hash-heading">Commit</th></tr></thead><tbody id="commits"></tbody></table></div>
      <footer><button id="more" hidden>${t("Carregar mais commits")}</button></footer>
      <script nonce="${nonce}" src="${translations}"></script>
      <script nonce="${nonce}" src="${script}"></script></body></html>`;
  }

  dispose() { for (const state of this.panels.values()) state.panel.dispose(); this.provider.dispose(); this.documents.clear(); }
}

module.exports = { GraphFeature };
