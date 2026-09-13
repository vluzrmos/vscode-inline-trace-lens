'use strict';
const { t } = require('./i18n');

function parseLog(text) {
  const fields = text.split('\0');
  const commits = [];
  for (let i = 0; i + 5 < fields.length; i += 6) {
    const [hash, parents, author, timestamp, subject, refs] = fields.slice(i, i + 6);
    if (!/^[a-f0-9]{40,64}$/.test(hash)) throw new Error(t("Resposta de git log inválida."));
    commits.push({ hash, parents: parents ? parents.split(' ') : [], author,
      timestamp: Number(timestamp), subject, refs });
  }
  return commits;
}

function parseBlame(text) {
  const result = new Map();
  let entry;
  for (const line of text.split('\n')) {
    const header = /^([a-f0-9]{40,64}) (\d+) (\d+)(?: (\d+))?$/.exec(line);
    if (header) entry = { hash: header[1], line: Number(header[3]) - 1, author: '', email: '', timestamp: 0, subject: '' };
    else if (entry && line.startsWith('author ')) entry.author = line.slice(7);
    else if (entry && line.startsWith('author-mail ')) entry.email = line.slice(12).replace(/^<|>$/g, '');
    else if (entry && line.startsWith('author-time ')) entry.timestamp = Number(line.slice(12));
    else if (entry && line.startsWith('summary ')) entry.subject = line.slice(8);
    else if (entry && line.startsWith('\t')) {
      result.set(entry.line, entry);
      entry = undefined;
    }
  }
  return result;
}

function parseFiles(text) {
  const fields = text.split('\0');
  const files = [];
  for (let i = 0; i < fields.length && fields[i];) {
    const status = fields[i++];
    const oldPath = fields[i++];
    if (oldPath === undefined) throw new Error(t("Resposta de diff inválida."));
    const renamed = /^[RC]/.test(status);
    const path = renamed ? fields[i++] : oldPath;
    if (path === undefined) throw new Error(t("Resposta de rename inválida."));
    files.push({ status, path, oldPath: renamed ? oldPath : path });
  }
  return files;
}

function relativeTime(timestamp, now = Date.now(), language = 'pt-BR') {
  const seconds = Math.max(0, Math.floor(now / 1000 - timestamp));
  if (language !== 'pt-BR') {
    if (seconds < 60) return language === 'es' ? 'ahora' : 'now';
    for (const [size, unit] of [[31536000, 'year'], [2592000, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute']]) {
      if (seconds >= size) return new Intl.RelativeTimeFormat(language, { numeric: 'always' }).format(-Math.floor(seconds / size), unit);
    }
  }
  for (const [size, singular, plural] of [[31536000, 'ano', 'anos'], [2592000, 'mês', 'meses'],
    [86400, 'dia', 'dias'], [3600, 'hora', 'horas'], [60, 'minuto', 'minutos']]) {
    if (seconds >= size) { const n = Math.floor(seconds / size); return `há ${n} ${n === 1 ? singular : plural}`; }
  }
  return 'agora';
}

module.exports = { parseLog, parseBlame, parseFiles, relativeTime };
