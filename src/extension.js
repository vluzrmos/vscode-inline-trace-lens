'use strict';

const vscode = require('vscode');
const { Git } = require('./core/git');
const { BlameFeature } = require('./features/blame');
const { GraphFeature } = require('./features/graph');
const { configure } = require('./core/i18n');

function activate(context) {
  if (!vscode.workspace.isTrusted) return;
  const setLanguage = () => configure(vscode.workspace.getConfiguration('inlinetracelens').get('language', 'auto'), vscode.env.language);
  setLanguage();
  const output = vscode.window.createOutputChannel('InlineTraceLens');
  const git = new Git(vscode.workspace.getConfiguration('inlinetracelens').get('git.path', 'git'));
  const graph = new GraphFeature(context, git, output);
  const blame = new BlameFeature(git, output);
  const safe = fn => async (...args) => {
    try { await fn(...args); } catch (error) { output.appendLine(error.stack || error.message); void vscode.window.showErrorMessage(`InlineTraceLens: ${error.message}`); }
  };
  context.subscriptions.push(output, git, graph, blame,
    vscode.commands.registerCommand('inlinetracelens.openGraph', safe(() => graph.open())),
    vscode.commands.registerCommand('inlinetracelens.showCommit', safe((root, hash) => graph.open(root, hash))),
    vscode.commands.registerCommand('inlinetracelens.toggleBlame', async () => {
      const config = vscode.workspace.getConfiguration('inlinetracelens');
      await config.update('blame.enabled', !config.get('blame.enabled', true), vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand('inlinetracelens.refresh', () => { blame.refresh(); graph.refresh(); }),
    vscode.window.onDidChangeWindowState(e => { if (e.focused) { blame.refresh(); graph.refresh(); } }),
    vscode.workspace.onDidSaveTextDocument(() => blame.refresh()),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('inlinetracelens.language')) { setLanguage(); blame.refresh(); graph.reloadLanguage(); }
      if (e.affectsConfiguration('inlinetracelens.git.path')) { git.executable = vscode.workspace.getConfiguration('inlinetracelens').get('git.path', 'git'); blame.refresh(); graph.refresh(); }
    }));
  // Watch common refs; explicit refresh and window focus also cover external worktree gitdirs.
  const watcher = vscode.workspace.createFileSystemWatcher('**/.git/{HEAD,index,packed-refs,refs/**}');
  let timer;
  const refresh = () => { clearTimeout(timer); timer = setTimeout(() => { blame.refresh(); graph.refresh(); }, 350); };
  context.subscriptions.push(watcher, watcher.onDidChange(refresh), watcher.onDidCreate(refresh), watcher.onDidDelete(refresh), { dispose: () => clearTimeout(timer) });
}

module.exports = { activate };
