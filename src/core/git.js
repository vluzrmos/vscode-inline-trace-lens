'use strict';
const { t } = require('./i18n');

const { spawn } = require('node:child_process');
const path = require('node:path');
const { parseLog, parseBlame, parseFiles } = require('./parsers');

const HASH = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
function assertHash(hash) {
  if (typeof hash !== 'string' || !HASH.test(hash)) throw new Error(t("Hash de commit inválido."));
}

class Git {
  constructor(executable = 'git') { this.executable = executable; this.children = new Set(); }

  run(cwd, args, input, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error(t("Operação cancelada.")));
      const child = spawn(this.executable, ['--no-pager', '--literal-pathspecs', '-c', 'color.ui=false', ...args], {
        cwd, shell: false, windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
        stdio: ['pipe', 'pipe', 'pipe']
      });
      this.children.add(child);
      const output = []; const errors = []; let bytes = 0; let failure;
      const cancel = () => { failure = new Error(t("Operação cancelada.")); child.kill(); };
      const timer = setTimeout(() => { failure = new Error(t("Git excedeu o limite de 30 segundos.")); child.kill(); }, 30000);
      signal?.addEventListener('abort', cancel, { once: true });
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 64 * 1024 * 1024) { failure = new Error(t("Resposta Git excedeu 64 MiB.")); child.kill(); }
        else output.push(chunk);
      });
      child.stderr.on('data', chunk => { if (errors.length < 100) errors.push(chunk); });
      child.stdin.on('error', () => {}); // Git can exit before consuming stdin.
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); this.children.delete(child); };
      child.on('error', error => { cleanup(); reject(error); });
      child.on('close', code => {
        cleanup();
        if (failure) reject(failure);
        else if (code !== 0) reject(new Error(Buffer.concat(errors).toString('utf8').trim() || t('Git terminou com código {code}.', { code })));
        else resolve(Buffer.concat(output).toString('utf8'));
      });
      child.stdin.end(input);
    });
  }

  async root(directory) { return (await this.run(directory, ['rev-parse', '--show-toplevel'])).trim(); }

  async hasHead(root) {
    try { await this.run(root, ['rev-parse', '--verify', 'HEAD']); return true; }
    catch (error) {
      if (/Needed a single revision|unknown revision|ambiguous argument/.test(error.message)) return false;
      throw error;
    }
  }

  async snapshot(root) {
    const head = await this.hasHead(root);
    const [branch, refsText, currentHash] = await Promise.all([
      this.run(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => t("HEAD destacado")),
      this.run(root, ['for-each-ref', '--format=%(refname)%00%(objectname)']),
      head ? this.run(root, ['rev-parse', 'HEAD']) : ''
    ]);
    const refs = refsText.trimEnd().split('\n').filter(Boolean).map(line => line.split('\0'));
    const revisions = [...new Set([...refs.map(ref => ref[1]), currentHash.trim()].filter(Boolean))];
    const reachable = hashes => hashes.length ? this.run(root, ['rev-list', '--stdin'], hashes.join('\n') + '\n') : '';
    const [local, remote, current] = await Promise.all([
      reachable(refs.filter(ref => ref[0].startsWith('refs/heads/')).map(ref => ref[1])),
      reachable(refs.filter(ref => ref[0].startsWith('refs/remotes/')).map(ref => ref[1])),
      reachable(currentHash ? [currentHash.trim()] : [])
    ]);
    const set = text => new Set(text.trim().split('\n').filter(Boolean));
    return { branch: branch.trim(), head, revisions, local: set(local), remote: set(remote), current: set(current) };
  }

  async log(root, skip, count, snapshot) {
    if (!snapshot.revisions.length) return [];
    const text = await this.run(root, ['log', '--stdin', '--topo-order', '--decorate=full',
      `--skip=${skip}`, `--max-count=${count}`, '-z', '--format=%H%x00%P%x00%an%x00%at%x00%s%x00%D'], snapshot.revisions.join('\n') + '\n');
    return parseLog(text).map(commit => ({ ...commit, local: snapshot.local.has(commit.hash),
      remote: snapshot.remote.has(commit.hash), current: snapshot.current.has(commit.hash) }));
  }

  async details(root, hash) {
    assertHash(hash);
    const parents = (await this.run(root, ['show', '-s', '--format=%P', hash, '--'])).trim().split(' ').filter(Boolean);
    // Merge commits are compared with their first parent; root commits with the empty tree.
    const args = parents.length ? ['diff', '--name-status', '-z', '-M', '--no-ext-diff', '--no-textconv', parents[0], hash, '--']
      : ['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-z', '-M', '--no-ext-diff', '--no-textconv', hash, '--'];
    const [text, message] = await Promise.all([this.run(root, args), this.run(root, ['show', '-s', '--format=%B', hash, '--'])]);
    return { hash, parent: parents[0], parents, message: message.trimEnd(), files: parseFiles(text) };
  }

  async userEmail(root, signal) {
    return (await this.run(root, ['config', '--default', '', '--get', 'user.email'], undefined, signal)).trim();
  }

  async blame(root, filename, contents, signal) {
    const relative = path.relative(root, filename).split(path.sep).join('/');
    if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error(t("Arquivo fora do repositório."));
    return parseBlame(await this.run(root, ['blame', '--line-porcelain', '--contents', '-', '--', relative], contents, signal));
  }

  async content(root, hash, filename) {
    assertHash(hash);
    if (typeof filename !== 'string' || !filename || filename.includes('\0')) throw new Error(t("Caminho inválido."));
    return this.run(root, ['show', '--no-ext-diff', '--no-textconv', `${hash}:${filename}`]);
  }

  dispose() { for (const child of this.children) child.kill(); }
}

module.exports = { Git, assertHash };
