# Interface de importação do MyAnimeList

## Objetivo
Adicionar ao menu do perfil um fluxo em quatro etapas para importar o arquivo oficial do MyAnimeList, usando a lógica de leitura e persistência já existente.

## Alterações
- Incluir “Importar do MyAnimeList” logo após “Estatísticas” no menu do perfil, preservando todos os demais itens e ações.
- Criar o diálogo de importação com as etapas Arquivo, Prévia, Importando e Resumo.
- Na prévia, mostrar contagens por status, itens já presentes e o aviso de duração.
- Durante a importação, exibir progresso e franquia atual, permitir cancelamento e impedir fechamento acidental.
- No resumo, mostrar totais e listas recolhíveis de vínculos e falhas, com avisos distintos para conclusão e cancelamento parcial.
- Integrar o diálogo à tela principal, atualizando a lista em memória conforme cada franquia é criada ou complementada.
- Garantir que uma importação em andamento seja abortada ao desmontar o diálogo.

## Detalhes técnicos
- Reutilizar `parseMalExport` e `runMalImport` sem mover regras de importação para a interface.
- Usar `AbortController`, `Progress`, componentes de diálogo existentes e avisos Sonner.
- Aceitar arquivos `.xml` e `.gz` e manter erros de leitura inline.
- Preservar AddAnimeDialog, StatsDialog, tierlist, filtros, ordenação, DnD, migrações e verificação de temporadas.

## Validação
- Executar lint, verificação de tipos e testes.
- Conferir no navegador abertura pelo menu, seleção de arquivo inválido, navegação entre etapas e bloqueio de fechamento durante importação.
