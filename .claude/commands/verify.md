---
description: Roda typecheck, test, lint e build e resume o resultado por etapa
allowed-tools: Bash(bun run typecheck) Bash(bun run test) Bash(bun run lint) Bash(bun run build) Bash(git diff *)
---

Rode, nesta ordem e cada um em sua própria chamada (não pare na primeira falha):

1. `bun run typecheck`
2. `bun run test`
3. `bun run lint`
4. `bun run build`

Depois rode `git diff --name-only HEAD` para saber os arquivos alterados na tarefa.

Responda com um resumo curto, uma linha por etapa: ✅ passou / ❌ falhou.
- Em falha, mostre os erros relevantes (arquivo:linha e mensagem), sem despejar o log inteiro.
- Lint: warning não é falha (há 16 warnings pré-existentes). Só falha com erros. Aponte warnings apenas se estiverem em arquivos da lista do `git diff`.
- Test: informe quantos passaram/pularam.
