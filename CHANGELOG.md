# Changelog

## 0.3.1

- Ícone original em SVG e PNG, incluído no pacote da extensão.
- GIF ilustrativo e alternativa estática no README.

## 0.3.0

- Português do Brasil, espanhol e inglês, com detecção pelo editor e configuração manual.
- Localização do grafo, blame, datas, tempos relativos, comandos, configurações e mensagens da extensão.
- Termos Git e conteúdo dos repositórios preservados.

## 0.2.2

- Exibe “Você” no blame quando o e-mail do autor coincide com o `user.email` efetivo do repositório.
- Preserva o nome original no tooltip; sem e-mail configurado, mantém o nome do autor.

## 0.2.1

- Blame somente nas linhas com cursores do editor ativo, nos modos decoration e inlay, com suporte a múltiplos cursores e sem duplicação na mesma linha.
- Atualização ao mover o cursor, com remoção imediata da anotação anterior e reaproveitamento do cache.

## 0.2.0

- Blame discreto com decoração nativa, fundo transparente e cor por tema.
- Hash clicável no tooltip; modo inlay opcional preserva clique direto.
- Grafo compacto com curvas contínuas, branches junto à mensagem e hashes sem fundo.
- Conexões acompanham a altura real das linhas e dos detalhes expandidos.
- Detalhes de commit, busca e atalhos Ctrl/Cmd+F, Ctrl/Cmd+R e Escape.

## 0.1.0

- Grafo topológico paginado com linhas de branches e merges.
- Indicadores de ancestralidade de HEAD, branches locais e referências remotas.
- Expansão de arquivos, mensagens completas e comparação no diff nativo.
- Blame por linha com buffer não salvo e hash clicável via inlay hints.
- Implementação modular sem dependências de execução ou desenvolvimento.
