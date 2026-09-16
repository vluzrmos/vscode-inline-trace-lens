'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');

test('Webview do Grafo: restaura e persiste commits expandidos, busca e detalhes via getState e setState', () => {
  const scriptPath = path.resolve(__dirname, '../media/graph.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf8');

  let state = {
    expanded: ['a'.repeat(40)],
    selected: 'a'.repeat(40),
    query: 'teste',
    detailCache: [['a'.repeat(40), { hash: 'a'.repeat(40), message: 'Msg', files: [], parents: [] }]],
    scrollY: 150
  };
  const postedMessages = [];

  const allCreatedElements = [];
  class MockElement {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.attributes = {};
      this.dataset = {};
      this.classList = {
        _set: new Set(),
        add: (...tokens) => tokens.forEach(t => this.classList._set.add(t)),
        remove: (...tokens) => tokens.forEach(t => this.classList._set.delete(t)),
        contains: token => this.classList._set.has(token),
        has: token => this.classList._set.has(token)
      };
      this.value = '';
      this.textContent = '';
      this.hidden = false;
      allCreatedElements.push(this);
    }
    set className(val) {
      this._className = val;
      this.classList._set = new Set(String(val).split(' ').filter(Boolean));
    }
    get className() { return this._className || ''; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = [...children]; }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k]; }
    getBoundingClientRect() { return { height: 30, width: 100 }; }
    addEventListener() {}
    focus() {}
    click(event = { stopPropagation: () => {} }) { if (this.onclick) this.onclick(event); }
  }

  const elements = new Map();
  const getOrCreate = id => {
    if (!elements.has(id)) elements.set(id, new MockElement('div'));
    return elements.get(id);
  };
  getOrCreate('search');
  getOrCreate('refresh');
  getOrCreate('more');
  getOrCreate('commits');
  getOrCreate('graph-layout');
  getOrCreate('repository');
  getOrCreate('status');
  getOrCreate('focus');
  getOrCreate('count');

  let messageHandler;
  const windowListeners = new Map();

  const domContext = {
    document: {
      documentElement: { lang: 'pt-BR', scrollTop: 0 },
      getElementById: id => getOrCreate(id),
      createElement: tag => new MockElement(tag),
      createElementNS: (ns, tag) => new MockElement(tag),
      querySelector: sel => {
        if (sel === '.graph-heading') return getOrCreate('graph-heading');
        if (sel === '.table-scroll') return getOrCreate('table-scroll');
        return null;
      },
      querySelectorAll: sel => {
        if (sel === '.file-menu') return allCreatedElements.filter(el => el.classList.has('file-menu'));
        if (sel === '.file-menu:not([hidden])') return allCreatedElements.filter(el => el.classList.has('file-menu') && !el.hidden);
        return [];
      },
      addEventListener: () => {},
      activeElement: null
    },
    window: {
      scrollY: 0,
      scrollTo: () => {},
      addEventListener: (evt, fn) => {
        windowListeners.set(evt, fn);
        if (evt === 'message') messageHandler = fn;
      }
    },
    InlineTraceLensI18n: {
      create: () => (str, params) => {
        if (!params) return str;
        return str.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
      }
    },
    acquireVsCodeApi: () => ({
      getState: () => state,
      setState: newState => { state = newState; },
      postMessage: msg => postedMessages.push(msg)
    }),
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame: fn => fn(),
    setTimeout: (fn) => fn(),
    clearTimeout: () => {}
  };

  vm.runInNewContext(scriptContent, domContext);

  // Deve enviar ready ao inicializar
  assert.equal(postedMessages[0].type, 'ready');

  // Input de busca deve ter sido restaurado
  assert.equal(getOrCreate('search').value, 'teste');

  // Simular recebimento de commits com reset: true
  const hashA = 'a'.repeat(40);
  const hashB = 'b'.repeat(40);
  messageHandler({
    data: {
      type: 'commits',
      reset: true,
      rows: [
        { hash: hashA, subject: 'Commit A', author: 'Dev', timestamp: 1000, refs: '', edges: [], width: 1, column: 0 },
        { hash: hashB, subject: 'Commit B', author: 'Dev', timestamp: 2000, refs: '', edges: [], width: 1, column: 0 }
      ],
      more: false,
      branch: 'main',
      root: '/repo'
    }
  });

  // O commit A deve continuar no estado de expanded persistido
  assert.ok(state.expanded.includes(hashA));
  assert.equal(state.selected, hashA);

  // Como o commit A já tinha detalhes no cache restaurado, não deve ter precisado pedir novamente
  // Mas se expandirmos o commit B com toggle:
  const commitRows = getOrCreate('commits').children;
  assert.ok(commitRows.length >= 2);

  // Simular toggle do commit B
  // Procurar botão do commit B
  let commitBButton;
  for (const tr of commitRows) {
    for (const td of tr.children) {
      for (const child of td.children) {
        if (child.dataset?.commit === hashB) commitBButton = child;
      }
    }
  }
  assert.ok(commitBButton, 'Botão do commit B encontrado');
  commitBButton.click();

  // Agora state.expanded deve conter tanto hashA quanto hashB
  assert.ok(state.expanded.includes(hashA));
  assert.ok(state.expanded.includes(hashB));
  assert.equal(state.selected, hashB);

  // Deve ter enviado mensagem de details para hashB
  const detailsReq = postedMessages.find(m => m.type === 'details' && m.hash === hashB);
  assert.ok(detailsReq, 'Pediu detalhes do commit B');

  // Ao receber detalhes de hashB, salva no detailCache
  messageHandler({
    data: {
      type: 'details',
      hash: hashB,
      message: 'Mensagem do B',
      files: [{ status: 'M', path: 'file.js', oldPath: 'file.js' }],
      parents: [hashA]
    }
  });

  assert.ok(state.detailCache.some(([h]) => h === hashB));

  // Agora simular um refresh completo (reset: true) com novos commits
  messageHandler({
    data: {
      type: 'commits',
      reset: true,
      rows: [
        { hash: hashA, subject: 'Commit A', author: 'Dev', timestamp: 1000, refs: '', edges: [], width: 1, column: 0 },
        { hash: hashB, subject: 'Commit B', author: 'Dev', timestamp: 2000, refs: '', edges: [], width: 1, column: 0 }
      ],
      more: false,
      branch: 'main',
      root: '/repo'
    }
  });

  // Ambos os commits A e B devem continuar expandidos!
  assert.ok(state.expanded.includes(hashA));
  assert.ok(state.expanded.includes(hashB));

  // Verificar se os botões de ações do arquivo do commit B foram criados
  const detailRows = getOrCreate('commits').children.filter(r => r.className?.includes('detail-row'));
  assert.ok(detailRows.length >= 1, 'Linha de detalhes renderizada');

  // Encontrar botões dentro da linha de detalhes
  const actionButtons = [];
  const findButtons = node => {
    if (node.tag === 'button') actionButtons.push(node);
    if (node.children) node.children.forEach(findButtons);
  };
  detailRows.forEach(findButtons);

  const menuBtn = actionButtons.find(b => b.title === 'Ações');
  assert.ok(menuBtn, 'Botão de menu Ações encontrado');

  // Clicar no botão para abrir o menu dropdown
  menuBtn.click();
  assert.equal(menuBtn.getAttribute('aria-expanded'), 'true');

  const openFileButton = actionButtons.find(b => b.textContent === 'Abrir arquivo');
  const openDiffButton = actionButtons.find(b => b.textContent === 'Abrir diff' && b.className?.includes('file-menu-item'));
  const copyPathButton = actionButtons.find(b => b.textContent === 'Copiar caminho');
  const copyRelButton = actionButtons.find(b => b.textContent === 'Copiar caminho relativo');

  assert.ok(openFileButton, 'Item Abrir arquivo encontrado');
  assert.ok(openDiffButton, 'Item Abrir diff encontrado');
  assert.ok(copyPathButton, 'Item Copiar caminho encontrado');
  assert.ok(copyRelButton, 'Item Copiar caminho relativo encontrado');

  openFileButton.click();
  assert.ok(postedMessages.some(m => m.type === 'openFile' && m.hash === hashB && m.index === 0));

  openDiffButton.click();
  assert.ok(postedMessages.some(m => m.type === 'file' && m.hash === hashB && m.index === 0));

  copyPathButton.click();
  assert.ok(postedMessages.some(m => m.type === 'copyPath' && m.hash === hashB && m.index === 0));

  copyRelButton.click();
  assert.ok(postedMessages.some(m => m.type === 'copyRelative' && m.hash === hashB && m.index === 0));
});

test('GraphFeature define iconPath ao abrir o webview panel', async () => {
  const filename = path.resolve(__dirname, '../src/features/graph.js');
  let createdPanel;
  const mockVscode = {
    workspace: {
      isTrusted: true,
      registerTextDocumentContentProvider: () => ({ dispose: () => {} })
    },
    window: {
      createWebviewPanel: (viewType, title, column, options) => {
        createdPanel = {
          viewType,
          title,
          options,
          webview: { onDidReceiveMessage: () => {}, html: '', asWebviewUri: u => u, cspSource: 'https://test.invalid' },
          onDidDispose: () => {}
        };
        return createdPanel;
      }
    },
    ViewColumn: { Active: 1 },
    Uri: {
      joinPath: (base, ...segments) => ({ path: `${base?.path || ''}/${segments.join('/')}` })
    }
  };

  const contextModule = { exports: {} };
  const localRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: contextModule,
    exports: contextModule.exports,
    require: name => name === 'vscode' ? mockVscode : localRequire(name),
    __dirname: path.dirname(filename),
    process
  });

  const { GraphFeature } = contextModule.exports;
  const mockContext = { extensionUri: { path: '/ext' } };
  const mockGit = { root: async () => '/repo' };
  const mockOutput = { appendLine: () => {} };
  const graph = new GraphFeature(mockContext, mockGit, mockOutput);
  await graph.open('/repo');

  assert.ok(createdPanel, 'Painel deve ter sido criado');
  assert.equal(createdPanel.iconPath.path, '/ext/media/icon.png');
});

