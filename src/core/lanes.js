'use strict';

// Pure layout: edges connect lane positions above/below each commit row.
// Keeping state between pages preserves merge lines at page boundaries.
function layout(commits, initial = []) {
  let lanes = [...initial];
  const rows = commits.map(commit => {
    let column = lanes.indexOf(commit.hash);
    const incoming = column >= 0;
    if (column < 0) { column = lanes.length; lanes.push(commit.hash); }
    const before = [...lanes];
    lanes.splice(column, 1);
    let insertion = column;
    for (const parent of commit.parents) {
      if (!lanes.includes(parent)) lanes.splice(insertion++, 0, parent);
    }
    const edges = [];
    before.forEach((hash, from) => {
      if (from !== column) edges.push({ from, to: lanes.indexOf(hash), commit: false });
    });
    commit.parents.forEach(hash => edges.push({ from: column, to: lanes.indexOf(hash), commit: true }));
    return { ...commit, column, incoming, edges, width: Math.max(before.length, lanes.length, 1) };
  });
  return { rows, lanes };
}

module.exports = { layout };
