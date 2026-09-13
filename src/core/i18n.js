'use strict';
const shared = require('../../media/i18n');
let language = 'pt-BR';
function configure(configured, editorLanguage) {
  language = shared.normalize(configured && configured !== 'auto' ? configured : editorLanguage);
}
function t(key, args) { return shared.create(language)(key, args); }
module.exports = { configure, t, getLanguage: () => language };
