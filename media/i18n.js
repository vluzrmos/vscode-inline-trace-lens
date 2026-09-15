'use strict';
// Shared by the extension host and the webview; no third-party runtime required.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.InlineTraceLensI18n = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const messages = {
    'Você': ['You', 'Tú'],
    'Você • alterações não commitadas': ['You • uncommitted changes', 'Tú • cambios sin commit'],
    'Abrir detalhes do commit': ['Open commit details', 'Abrir detalles del commit'],
    'Abrir commit e arquivos alterados': ['Open commit and changed files', 'Abrir commit y archivos modificados'],
    'abrir commit': ['open commit', 'abrir commit'],
    'Detalhes do commit': ['Commit details', 'Detalles del commit'],
    'Merge · comparação com o primeiro pai': ['Merge · compared with the first parent', 'Merge · comparación con el primer padre'],
    '{count} arquivos alterados': ['{count} changed files', '{count} archivos modificados'],
    'Abrir diff ↗': ['Open diff ↗', 'Abrir diff ↗'],
    'Abrir diff': ['Open diff', 'Abrir diff'],
    'Abrir arquivo': ['Open file', 'Abrir archivo'],
    'Copiar caminho': ['Copy path', 'Copiar ruta'],
    'Copiar caminho relativo': ['Copy relative path', 'Copiar ruta relativa'],
    'Caminho copiado para a área de transferência.': ['Path copied to clipboard.', 'Ruta copiada al portapapeles.'],
    'Ações': ['Actions', 'Acciones'],
    'Copiado!': ['Copied!', '¡Copiado!'],
    'Grafo': ['Graph', 'Grafo'],
    'Atual': ['Current', 'Actual'],
    'Local': ['Local', 'Local'],
    'Remoto': ['Remote', 'Remoto'],
    'sim': ['yes', 'sí'], 'não': ['no', 'no'],
    'Carregando arquivos…': ['Loading files…', 'Cargando archivos…'],
    '{matches} encontrados / {count} carregados': ['{matches} matches / {count} loaded', '{matches} encontrados / {count} cargados'],
    '{count} commits': ['{count} commits', '{count} commits'],
    'Atualizando…': ['Refreshing…', 'Actualizando…'],
    'Carregando…': ['Loading…', 'Cargando…'],
    'Este repositório ainda não tem commits.': ['This repository has no commits yet.', 'Este repositorio todavía no tiene commits.'],
    'Buscar nos commits carregados': ['Search loaded commits', 'Buscar en los commits cargados'],
    'Buscar commit, autor ou branch…': ['Search commit, author or branch…', 'Buscar commit, autor o branch…'],
    'Atualizar histórico (Ctrl/Cmd+R)': ['Refresh history (Ctrl/Cmd+R)', 'Actualizar historial (Ctrl/Cmd+R)'],
    '↻ Atualizar': ['↻ Refresh', '↻ Actualizar'],
    'Histórico completo': ['Full history', 'Historial completo'],
    'Alcançável a partir de HEAD': ['Reachable from HEAD', 'Alcanzable desde HEAD'],
    'Alcançável por branches locais': ['Reachable from local branches', 'Alcanzable desde branches locales'],
    'Referências remotas do último fetch feito pelo usuário': ['Remote references from your last fetch', 'Referencias remotas de tu último fetch'],
    '● Atual': ['● Current', '● Actual'], '● Local': ['● Local', '● Local'], '● Remoto': ['● Remote', '● Remoto'],
    'Carregando histórico…': ['Loading history…', 'Cargando historial…'],
    'Commit selecionado': ['Selected commit', 'Commit seleccionado'],
    'Descrição': ['Description', 'Descripción'], 'Presença': ['Reachability', 'Alcance'],
    'Autor': ['Author', 'Autor'], 'Data': ['Date', 'Fecha'],
    'Carregar mais commits': ['Load more commits', 'Cargar más commits'],
    'Selecionar repositório': ['Select repository', 'Seleccionar repositorio'],
    'Abra uma pasta Git ou um arquivo de um repositório. Verifique se Git está instalado.': ['Open a Git folder or a file in a repository. Make sure Git is installed.', 'Abre una carpeta Git o un archivo de un repositorio. Comprueba que Git esté instalado.'],
    'Confie no workspace para usar o Git.': ['Trust the workspace to use Git.', 'Confía en el workspace para usar Git.'],
    'Mudança de tipo de arquivo. O diff textual pode não representar links simbólicos ou submódulos.': ['File type changed. A text diff may not represent symbolic links or submodules.', 'Cambió el tipo de archivo. Un diff de texto puede no representar enlaces simbólicos o submódulos.'],
    'Arquivo binário: diff textual indisponível.': ['Binary file: text diff unavailable.', 'Archivo binario: diff de texto no disponible.'],
    'Repositório': ['Repository', 'Repositorio'], 'Identidade Git': ['Git identity', 'Identidad Git'],
    'Hash de commit inválido.': ['Invalid commit hash.', 'Hash de commit no válido.'],
    'Operação cancelada.': ['Operation cancelled.', 'Operación cancelada.'],
    'Git excedeu o limite de 30 segundos.': ['Git exceeded the 30-second limit.', 'Git superó el límite de 30 segundos.'],
    'Resposta Git excedeu 64 MiB.': ['Git output exceeded 64 MiB.', 'La salida de Git superó 64 MiB.'],
    'Git terminou com código {code}.': ['Git exited with code {code}.', 'Git terminó con el código {code}.'],
    'HEAD destacado': ['Detached HEAD', 'HEAD separado'],
    'Arquivo fora do repositório.': ['File outside the repository.', 'Archivo fuera del repositorio.'],
    'Caminho inválido.': ['Invalid path.', 'Ruta no válida.'],
    'Resposta de git log inválida.': ['Invalid git log output.', 'Salida de git log no válida.'],
    'Resposta de diff inválida.': ['Invalid diff output.', 'Salida de diff no válida.'],
    'Resposta de rename inválida.': ['Invalid rename output.', 'Salida de rename no válida.']
  };
  function normalize(locale) {
    const language = String(locale || '').toLowerCase().split(/[-_]/)[0];
    return language === 'pt' ? 'pt-BR' : language === 'es' ? 'es' : 'en';
  }
  function create(locale) {
    locale = normalize(locale);
    return (key, args = {}) => {
      const values = Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : undefined;
      const message = locale === 'pt-BR' || !values ? key : values[locale === 'es' ? 1 : 0];
      return message.replace(/\{(\w+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(args, name) ? String(args[name]) : match);
    };
  }
  return { normalize, create, messages };
});
