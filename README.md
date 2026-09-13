<p align="center">
  <img src="https://raw.githubusercontent.com/vluzrmos/vscode-inline-trace-lens/main/media/icon.png" width="112" height="112" alt="InlineTraceLens: lente com um caminho de commits">
</p>


# InlineTraceLens

Exibe autoria e histórico de arquivos em linha, junto a um grafo do histórico Git.

![Demonstração do grafo Git e do blame com múltiplos cursores](https://raw.githubusercontent.com/vluzrmos/vscode-inline-trace-lens/main/media/demo.gif)

*Demonstração ilustrativa com dados fictícios. [Ver imagem estática](https://raw.githubusercontent.com/vluzrmos/vscode-inline-trace-lens/main/media/demo-preview.png).*

## Instalar

Requer **VS Code 1.85+**, VSCodium ou fork que implemente a API pública compatível, e **Git 2.30+** no host da extensão. Não depende do Marketplace da Microsoft nem da extensão Git integrada. Funciona no host de workspace de SSH, WSL e containers com Git instalado. Não funciona em ambientes exclusivamente web ou workspaces virtuais.

1. Com Node.js 22 LTS atualizado ou mais recente, execute `npm ci --ignore-scripts` e depois `npm run package`.
2. No editor, execute **Extensions: Install from VSIX…** e selecione `dist/vscode/inlinetracelens-0.3.1.vsix`.
3. Abra uma pasta Git confiável. Execute **InlineTraceLens: Abrir grafo Git** na paleta ou use o ícone na barra do editor/SCM.

Também é possível executar `code --install-extension dist/vscode/inlinetracelens-0.3.1.vsix` ou o equivalente `codium`. Para desenvolver, abra esta pasta no editor e pressione **F5**.

## Funcionalidades

- Tabela de commits em ordem topológica com conexões de branches e merges. **Carregar mais commits** permite percorrer todo o histórico alcançável por referências Git, em páginas. Não inclui commits órfãos acessíveis apenas por reflog.
- **Atual**: o commit é ancestral de HEAD; **Local**: alcançável por algum branch local; **Remoto**: alcançável por alguma referência `refs/remotes/*`. Um commit pode estar em todos os grupos. As referências remotas refletem o último fetch feito pelo usuário; a extensão não acessa a rede.
- Clique no commit para expandir mensagem e arquivos A/M/D/R/C/T. Clique no arquivo para abrir o diff nativo, incluindo adições, remoções e renomeações. Merges são comparados com o **primeiro pai**. Arquivos binários não têm diff textual; submódulos podem não ser exibidos como texto.
- Filtro por autor, mensagem, hash e referências nos commits já carregados. Correspondências ficam destacadas; as demais linhas continuam visíveis para preservar conexões corretas.
- Autoria, tempo relativo, resumo e hash somente no fim das **linhas com cursores** (incluindo múltiplos cursores, com uma anotação por linha) com decorações nativas discretas e fundo transparente. Passe o mouse sobre a anotação e clique no hash no tooltip para abrir o commit. O modo opcional `inlay` permite Ctrl/Cmd+clique direto, com cores e fundo controlados pelo editor.
- Alterações ainda não salvas são calculadas com `git blame --contents -` e marcadas como não commitadas. Arquivos novos não rastreados não têm histórico.
- Seleção de repositório em workspaces com várias pastas; repositórios aninhados são descobertos quando um de seus arquivos está ativo.

No modo `inlay`, habilite `editor.inlayHints.enabled` nas configurações do editor. O modo padrão `decoration` independe dessa opção. **InlineTraceLens: Ativar/desativar autoria por linha** controla somente esta extensão.

## Configuração

| Configuração | Padrão | Uso |
| --- | --- | --- |
| `inlinetracelens.blame.displayMode` | `decoration` | Decoração transparente ou `inlay` com clique direto |
| `inlinetracelens.blame.enabled` | `true` | Ativa as anotações |
| `inlinetracelens.blame.messageLength` | `64` | Limite do resumo |
| `inlinetracelens.blame.maxFileBytes` | `1048576` | Limite de arquivo para blame |
| `inlinetracelens.graph.pageSize` | `200` | Commits por página |
| `inlinetracelens.git.path` | `git` | Executável no host; configuração de máquina |

O blame mantém cache limitado por documento/versão, invalida durante edições e atualiza o tempo relativo a cada minuto. Atualizações de refs comuns, salvamento e foco da janela invalidam o cache. **InlineTraceLens: Atualizar grafo e blame** força atualização, inclusive para worktrees cujo diretório Git está fora do workspace. O grafo usa revisões fixas por sessão de paginação; clique em Atualizar para obter novas revisões.

## Arquitetura e segurança

- `src/core/git.js`: serviço de Git sem dependência do editor, processos sem shell, argumentos separados, timeout de 30 segundos, limite de saída de 64 MiB e cancelamento.
- `src/core/parsers.js` e `lanes.js`: parsers e cálculo de conexões puros, testáveis com Node.
- `src/features/blame.js`: decorações e inlay hints com cache e invalidação.
- `src/features/graph.js`: controlador da webview e documentos virtuais de diff.
- `media/`: interface sem frameworks; dados Git inseridos com `textContent`, política CSP restritiva, sem scripts externos ou conexões de rede. Mensagens para abrir arquivos são verificadas contra os detalhes obtidos pelo host.
- `src/extension.js`: composição e ciclo de vida. Para acrescentar uma funcionalidade, crie um módulo em `features`, injete os serviços necessários e registre seus comandos/disposable aqui e no manifesto.

**Zero dependências externas de execução.** Usa somente API pública estável do VS Code e bibliotecas padrão do Node. O empacotamento usa a ferramenta oficial `@vscode/vsce`, com versão fixada e dependências registradas em `package-lock.json`; essas ferramentas não são incluídas no VSIX. Sem telemetria, credenciais, fetch, hooks de escrita ou alterações no repositório. Requer confiança no workspace. O executável Git e o próprio editor devem ser mantidos atualizados pelo usuário. Nenhum software pode ser declarado livre de vulnerabilidades apenas pela ausência de dependências.

Históricos muito grandes podem exceder os limites de tempo/saída ao calcular ancestralidade; nesse caso é exibido um erro, sem truncamento silencioso. Páginas carregadas permanecem na webview, portanto percorrer um histórico inteiro muito grande aumenta o uso de memória. O suporte a forks decorre do contrato da API, não de testes em todos os editores.

## Verificação

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run package:files
npm run package
```

Testes usam repositórios temporários reais: histórico vazio, commit raiz, buffer editado, merge, rename, exclusão, refs remotas, HEAD destacado e paginação durante novos commits. Layout verifica conexões entre páginas.

Validação manual no Extension Development Host: abra um repositório, confira as anotações e o link do hash no tooltip (ou Ctrl/Cmd+clique no modo inlay); edite sem salvar; abra o grafo, expanda um merge, abra diffs de A/D/R; alterne tema e teste navegação por teclado. Repita a instalação no VSCodium/fork desejado antes de distribuir. Não há teste automatizado de interface do editor nesta versão.

## Referências

- [API pública do VS Code](https://code.visualstudio.com/api/references/vscode-api)
- [Segurança de webviews](https://code.visualstudio.com/api/extension-guides/webview)
- [git blame](https://git-scm.com/docs/git-blame)

A cor do blame pode ser personalizada com `workbench.colorCustomizations` → `inlinetracelens.blameForeground`. A extensão não altera as cores dos inlay hints de outras extensões.

No blame, o autor aparece como **Você** quando seu e-mail coincide com `git config user.email` efetivo no repositório (configuração local prevalece sobre global). A comparação ignora espaços nas extremidades e diferenças entre maiúsculas e minúsculas. O tooltip mantém o nome original. Sem e-mail configurado, permanece o nome do autor. Mudanças de identidade são aplicadas na atualização do cache; use **InlineTraceLens: Atualizar grafo e blame** para atualizar imediatamente.

## Idiomas

Português do Brasil (`pt-BR`), espanhol (`es`) e inglês (`en`). Por padrão (`auto`), o grafo e o blame usam o idioma do editor; outros idiomas usam inglês. Configure `inlinetracelens.language` para escolher manualmente. A troca atualiza o blame e recarrega os painéis de grafo abertos.

Os títulos dos comandos e as descrições das configurações usam a localização nativa do VS Code (`package.nls.*.json`) e seguem sempre o idioma do editor. Termos Git como commit, branch, merge, blame, diff, HEAD e fetch permanecem sem tradução. Mensagens dos commits, nomes de autores e branches, caminhos e diagnósticos emitidos pelo próprio Git não são traduzidos. Datas e tempos relativos seguem o idioma selecionado.

## Recursos visuais

Ícone original em `media/icon.svg` (vetor editável) e `media/icon.png` (512 × 512). Animação ilustrativa em `media/demo.gif`, com alternativa estática em `media/demo-preview.png`. Para regenerar somente os recursos visuais, execute `python scripts/generate-media.py` com Pillow instalado. Essa ferramenta opcional não é necessária para executar ou empacotar a extensão.

## Empacotamento para publicação

`npm run package` gera o VSIX pelo empacotador oficial em `dist/vscode/`, para o Marketplace da Microsoft, e uma cópia idêntica em `dist/vsx/`, para o Open VSX. As duas lojas usam o mesmo formato VSIX. A lista permitida em `.vscodeignore` inclui somente código de execução, traduções, ícone e documentação. Testes, ferramentas, previews e dependências de desenvolvimento ficam fora do pacote. O README carrega a demonstração por HTTPS do repositório público. Os comandos de verificação e empacotamento não publicam a extensão.
