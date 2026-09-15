'use strict';
(() => {
  const vscode = acquireVsCodeApi();
  const language = document.documentElement.lang;
  const t = InlineTraceLensI18n.create(language);
  const $ = id => document.getElementById(id);
  const savedState = (typeof vscode?.getState === 'function' ? vscode.getState() : undefined) || {};
  let rows = []; let more = false;
  let selected = savedState.selected;
  const detailCache = new Map(Array.isArray(savedState.detailCache) ? savedState.detailCache : []);
  const expanded = new Set(Array.isArray(savedState.expanded) ? savedState.expanded : []);
  let restoredScroll = false;
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const request = (type, fields = {}) => vscode.postMessage({ type, ...fields });
  const busy = value => { $('refresh').disabled = value; $('more').disabled = value; };
  function saveState() {
    if (typeof vscode?.setState !== 'function') return;
    const tableScroll = document.querySelector('.table-scroll');
    vscode.setState({
      selected,
      expanded: [...expanded],
      detailCache: [...detailCache.entries()].slice(-100),
      query: $('search')?.value || '',
      scrollY: window.scrollY || document.documentElement.scrollTop || 0,
      tableScrollLeft: tableScroll ? tableScroll.scrollLeft : 0,
      tableScrollTop: tableScroll ? tableScroll.scrollTop : 0
    });
  }
  function filesView(details) {
    const container = element('div', undefined, 'details');
    const heading = element('div', undefined, 'detail-heading');
    heading.append(element('strong', t("Detalhes do commit")), element('code', details.hash));
    container.append(heading, element('pre', details.message));
    if (details.parents.length > 1) container.append(element('p', t("Merge · comparação com o primeiro pai"), 'muted'));
    container.append(element('div', t('{count} arquivos alterados', { count: details.files.length }), 'files-heading'));
    details.files.forEach((file, index) => {
      const row = element('div', undefined, 'file-item');
      const info = element('button', undefined, 'file-info');
      info.title = t("Abrir diff");
      info.append(
        element('span', file.status, `file-status status-${file.status[0]}`),
        element('span', file.oldPath !== file.path ? `${file.oldPath} → ${file.path}` : file.path, 'file-path')
      );
      info.onclick = () => request('file', { hash: details.hash, index });

      const dropdown = element('div', undefined, 'file-dropdown');
      const menuBtn = element('button', '⋮', 'file-menu-btn');
      menuBtn.title = t("Ações");
      menuBtn.setAttribute('aria-label', t("Ações"));
      menuBtn.setAttribute('aria-haspopup', 'true');
      menuBtn.setAttribute('aria-expanded', 'false');

      const menu = element('div', undefined, 'file-menu');
      menu.hidden = true;

      const closeMenu = () => {
        menu.hidden = true;
        menuBtn.setAttribute('aria-expanded', 'false');
      };

      const openFileBtn = element('button', t("Abrir arquivo"), 'file-menu-item');
      openFileBtn.onclick = e => {
        e.stopPropagation();
        closeMenu();
        request('openFile', { hash: details.hash, index });
      };

      const openDiffBtn = element('button', t("Abrir diff"), 'file-menu-item');
      openDiffBtn.onclick = e => {
        e.stopPropagation();
        closeMenu();
        request('file', { hash: details.hash, index });
      };

      const copyPathBtn = element('button', t("Copiar caminho"), 'file-menu-item');
      copyPathBtn.onclick = e => {
        e.stopPropagation();
        request('copyPath', { hash: details.hash, index });
        copyPathBtn.textContent = `✓ ${t("Copiado!")}`;
        copyPathBtn.classList.add('copied');
        setTimeout(() => {
          copyPathBtn.textContent = t("Copiar caminho");
          copyPathBtn.classList.remove('copied');
          closeMenu();
        }, 500);
      };

      const copyRelBtn = element('button', t("Copiar caminho relativo"), 'file-menu-item');
      copyRelBtn.onclick = e => {
        e.stopPropagation();
        request('copyRelative', { hash: details.hash, index });
        copyRelBtn.textContent = `✓ ${t("Copiado!")}`;
        copyRelBtn.classList.add('copied');
        setTimeout(() => {
          copyRelBtn.textContent = t("Copiar caminho relativo");
          copyRelBtn.classList.remove('copied');
          closeMenu();
        }, 500);
      };

      menuBtn.onclick = e => {
        e.stopPropagation();
        const isOpen = !menu.hidden;
        document.querySelectorAll('.file-menu').forEach(m => {
          m.hidden = true;
          m.previousElementSibling?.setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          menu.hidden = false;
          menuBtn.setAttribute('aria-expanded', 'true');
        }
      };

      menu.append(openFileBtn, openDiffBtn, copyPathBtn, copyRelBtn);
      dropdown.append(menuBtn, menu);
      row.append(info, dropdown);
      container.append(row);
    });
    return container;
  }
  // SVGs share a fixed horizontal coordinate system. ResizeObserver uses the actual
  // table cell height so borders, zoom and expanded details never break the edges.
  const drawings = new Map();
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const info = drawings.get(entry.target);
      if (info) draw(entry.target, info.row, info.width, info.continuation);
    }
  });
  function draw(cell, row, width, continuation) {
    const ns = 'http://www.w3.org/2000/svg';
    const height = cell.getBoundingClientRect().height || 30;
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('aria-hidden', 'true');
    const x = col => 18 + col * 18;
    const line = (from, to, start, end, color) => {
      const p = document.createElementNS(ns, 'path');
      const middle = (start + end) / 2;
      p.setAttribute('d', from === to ? `M${x(from)},${start}V${end}` : `M${x(from)},${start}C${x(from)},${middle} ${x(to)},${middle} ${x(to)},${end}`);
      p.setAttribute('class', `lane lane-${color % 6}`); svg.append(p);
    };
    if (continuation) new Set(row.edges.map(e => e.to)).forEach(to => line(to, to, 0, height, to));
    else {
      row.edges.filter(e => !e.commit).forEach(e => line(e.from, e.to, 0, height, e.to));
      if (row.incoming) line(row.column, row.column, 0, height / 2, row.column);
      row.edges.filter(e => e.commit).forEach(e => line(e.from, e.to, height / 2, height, e.to));
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', String(x(row.column))); circle.setAttribute('cy', String(height / 2)); circle.setAttribute('r', '3.8');
      circle.setAttribute('class', `node lane-${row.column % 6}`); svg.append(circle);
    }
    cell.replaceChildren(svg);
  }
  function graphCell(row, width, continuation = false) {
    const cell = element('td', undefined, 'graph-cell');
    drawings.set(cell, { row, width, continuation }); observer.observe(cell); return cell;
  }
  function toggle(hash) {
    selected = hash;
    if (expanded.has(hash)) expanded.delete(hash);
    else { expanded.add(hash); if (!detailCache.has(hash)) request('details', { hash }); }
    saveState();
    render();
  }
  function render() {
    const focused = document.activeElement?.dataset.commit;
    observer.disconnect(); drawings.clear();
    const query = $('search').value.toLowerCase();
    const body = $('commits'); body.replaceChildren(); let matches = 0;
    const width = Math.max(72, ...rows.map(row => row.width * 18 + 24));
    $('graph-layout').textContent = `.graph-heading { width: ${width}px; }`;
    // Width is applied to a column via an SVG in its header; no inline style / CSP exception.
    const spacer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    spacer.setAttribute('width', String(width)); spacer.setAttribute('height', '0');
    document.querySelector('.graph-heading').replaceChildren(element('span', t("Grafo")), spacer);
    for (const row of rows) {
      const match = !query || [row.subject, row.author, row.hash, row.refs].some(s => s.toLowerCase().includes(query));
      if (match) matches++;
      const tr = element('tr', undefined, ['commit-row', match ? '' : 'dimmed', selected === row.hash ? 'selected' : ''].join(' '));
      tr.append(graphCell(row, width));
      const summary = element('td', undefined, 'summary');
      const button = element('button', undefined, 'commit');
      button.dataset.commit = row.hash; button.setAttribute('aria-expanded', String(expanded.has(row.hash)));
      button.append(element('span', expanded.has(row.hash) ? '⌄' : '›', 'chevron'));
      for (const ref of row.refs.split(', ').filter(Boolean)) {
        const kind = ref.startsWith('HEAD') ? 'head' : ref.startsWith('tag:') ? 'tag' : ref.startsWith('refs/remotes/') ? 'remote-ref' : 'branch';
        const label = ref.replace(/refs\/(heads|remotes|tags)\//g, '');
        const badge = element('span', label, `ref ${kind}`); badge.title = ref;
        button.append(badge);
      }
      const subject = element('span', row.subject, 'subject'); subject.title = row.subject;
      button.append(subject); button.onclick = () => toggle(row.hash); summary.append(button); tr.append(summary);
      const scope = element('td', undefined, 'scope');
      for (const [flag, label] of [['current', t("Atual")], ['local', t("Local")], ['remote', t("Remoto")]]) {
        const indicator = element('span', row[flag] ? '●' : '·', row[flag] ? flag : 'absent');
        indicator.title = `${label}: ${row[flag] ? t("sim") : t("não")}`; indicator.setAttribute('aria-label', indicator.title); scope.append(indicator);
      }
      const author = element('td', row.author, 'author'); author.title = row.author;
      const date = element('td', new Date(row.timestamp * 1000).toLocaleDateString(language), 'date');
      date.title = new Date(row.timestamp * 1000).toLocaleString(language);
      const hashCell = element('td'); const hash = element('button', row.hash.slice(0, 8), 'hash');
      hash.title = row.hash; hash.onclick = () => toggle(row.hash); hashCell.append(hash);
      tr.append(scope, author, date, hashCell); body.append(tr);
      if (expanded.has(row.hash)) {
        const detailRow = element('tr', undefined, 'detail-row');
        const td = element('td'); td.colSpan = 5;
        td.append(detailCache.has(row.hash) ? filesView(detailCache.get(row.hash)) : element('p', t("Carregando arquivos…")));
        detailRow.append(graphCell(row, width, true), td); body.append(detailRow);
      }
    }
    $('count').textContent = query ? t('{matches} encontrados / {count} carregados', { matches, count: rows.length }) : t('{count} commits', { count: rows.length });
    $('more').hidden = !more;
    if (focused) [...document.querySelectorAll('.commit')].find(button => button.dataset.commit === focused)?.focus({ preventScroll: true });
  }
  $('refresh').onclick = () => { busy(true); $('status').textContent = t("Atualizando…"); request('refresh'); };
  $('more').onclick = () => { busy(true); $('status').textContent = t("Carregando…"); request('more'); };
  $('search').oninput = () => { saveState(); render(); };
  if (savedState.query && $('search')) $('search').value = savedState.query;
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); $('search').focus(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r') { event.preventDefault(); $('refresh').click(); }
    if (event.key === 'Escape') {
      const openMenus = document.querySelectorAll('.file-menu:not([hidden])');
      if (openMenus.length) {
        openMenus.forEach(m => {
          m.hidden = true;
          m.previousElementSibling?.setAttribute('aria-expanded', 'false');
        });
        return;
      }
      expanded.clear(); $('focus').replaceChildren(); saveState(); render();
    }
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.file-menu:not([hidden])').forEach(m => {
      m.hidden = true;
      m.previousElementSibling?.setAttribute('aria-expanded', 'false');
    });
  });
  let scrollDebounce;
  const onScroll = () => {
    clearTimeout(scrollDebounce);
    scrollDebounce = setTimeout(saveState, 200);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  document.querySelector('.table-scroll')?.addEventListener('scroll', onScroll, { passive: true });

  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'commits') {
      if (message.reset) { rows = []; $('focus').replaceChildren(); }
      rows.push(...message.rows); more = message.more;
      const repo = message.root.split(/[\\/]/).pop();
      $('repository').textContent = `${repo}   /   ${message.branch}`; $('repository').title = message.root;
      $('status').textContent = rows.length ? '' : t("Este repositório ainda não tem commits.");
      busy(false);
      for (const hash of expanded) {
        if (rows.some(r => r.hash === hash) && !detailCache.has(hash)) {
          request('details', { hash });
        }
      }
      saveState();
      render();
      if (!restoredScroll) {
        restoredScroll = true;
        if (savedState.scrollY) window.scrollTo(0, savedState.scrollY);
        const tableScroll = document.querySelector('.table-scroll');
        if (tableScroll) {
          if (savedState.tableScrollLeft) tableScroll.scrollLeft = savedState.tableScrollLeft;
          if (savedState.tableScrollTop) tableScroll.scrollTop = savedState.tableScrollTop;
        }
      }
    } else if (message.type === 'details') {
      detailCache.set(message.hash, message);
      if (rows.some(row => row.hash === message.hash)) { expanded.add(message.hash); selected = message.hash; }
      else $('focus').replaceChildren(element('h2', `Commit ${message.hash.slice(0, 8)}`), filesView(message));
      saveState();
      render();
    } else if (message.type === 'error') { $('status').textContent = message.message; busy(false); }
  });
  request('ready');
})();
