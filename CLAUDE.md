@AGENTS.md

# Umi Watchlist

Watchlist/ranker pessoal de animes. TanStack Start (React 19) + Supabase, deploy em Cloudflare Workers.
O código é a fonte de verdade.

## Fase atual: transição Lovable → Claude Code (etapa 1)

- **Backend está no Lovable Cloud** (Supabase gerenciado, projeto `fygzuvvjzznzrbmbfpum`). Não há acesso ao dashboard nem à CLI do Supabase.
- **Não altere schema.** Não crie nem aplique migrations em `supabase/migrations/`. Se uma tarefa exigir mudança de banco, pare e avise — ela será feita pelo Lovable.
- **Não edite** `.env`, `supabase/config.toml` nem `src/integrations/supabase/*` (arquivos gerados/gerenciados pelo Lovable; `types.ts` e `client.ts` são auto-gerados).
- **Não mexa em `vite.config.ts`** sem motivo: `@lovable.dev/vite-tanstack-config` já inclui tanstackStart, react, tailwind, tsconfig paths, cloudflare e alias `@`. Adicionar esses plugins de novo quebra o build.
- O deploy ainda é pelo Lovable (sync do GitHub + Publish). O Lovable também commita na `main`: rode `git pull` antes de começar.

## Comandos

Gerenciador: **Bun** (não use npm — o `npm install` falha com os `overrides` do `package.json`).

```bash
bun install
bun run dev
bun run test        # vitest
bun run lint
bun run build
bun run typecheck
```

Antes de encerrar uma tarefa: `bun run test` e `bun run build` passando, sem erros novos de typecheck/lint.

## Ferramentas

- Antes de usar API de TanStack Start/Router, Tailwind v4 ou React 19 de que
  não tenha certeza, consulte a documentação via context7.
- Em mudanças de UI, verifique no Chrome (chrome-devtools) com `bun run dev`
  rodando: desktop e 375px de largura, e tire screenshot.

## Mapa

- `src/routes/` — só `/auth` (`auth.tsx`) e `/` (`_authenticated.index.tsx`, ~3k linhas, o app inteiro). `_authenticated.tsx` é só o gate de sessão. `routeTree.gen.ts` é gerado.
- `src/lib/anime-storage.ts` — domínio + acesso ao Supabase (tipos, `TIER_VALUE`, `tierFromAverage`, `isExcludedFromAverage`, médias, tempo).
- `src/lib/jikan-client.ts` — cliente Jikan: limitador compartilhado (3/s e 60/min, prioridade interativa), retry em 429/5xx com backoff exponencial e `Retry-After`. `src/lib/jikan-chain.ts` — cadeia de sequels (`ChainSeason`).
- `src/lib/mal-import.ts` — import do export do MAL (roda no browser). `src/lib/migrations.ts` — backfill.
- `src/lib/avatar-upload.ts` — upload de avatar (Supabase Storage).
- `src/lib/tierlist-image.ts` — geração do PNG da tierlist "Meu gosto" (layout puro + Canvas 2D).
- `src/lib/anilist-client.ts` — cliente AniList (limitador de 28/min): banner e cadeia de temporadas e estreias por ID do MAL, usada como fallback da verificação e para completar datas das não lançadas.
- `src/lib/anime-banner.ts` — query compartilhada do banner do AniList (pódio e detalhe) e o malId usado para buscá-lo.
- `src/lib/ranking-podium.ts` — decide se o pódio do Top 3 aparece (modo MAL, sem busca, 3+ animes) e separa os 3 primeiros.
- `src/lib/scan-types.ts` — tipos do resultado da verificação de temporadas e classificação de status (parcial, falha, queda de fonte).
- `src/lib/score-format.ts` — formatação e cor das notas.
- `src/lib/tier-drop-animation.ts` — animação de soltar na tierlist (dnd-kit), respeitando movimento reduzido.
- `src/lib/view-transition.ts` — `withViewTransition`: View Transitions API com fallback e respeito a movimento reduzido.
- `src/components/` — componentes próprios. `src/components/ui/` é shadcn: não mexer sem motivo.
- `src/styles.css` — tokens de tema no `:root` + `@theme inline`.

## Invariantes

- Não trocar stack: TanStack Start/Router (file-based)/Query, Supabase, dnd-kit, recharts, sonner, lucide-react, Tailwind v4 + shadcn/ui.
- Auth, persistência e RLS intactos.
- Tema só via tokens CSS. **Zero cor hardcoded.**
- Integração Jikan intacta, salvo quando a tarefa for nela.
- Mudanças de UI preservam a lógica de domínio: médias, exclusão de OVA/Special, `TIER_VALUE`, ordenação, cálculo de tempo.
- Acessibilidade: `role="status"`/`aria-busy` em carregamento, `.focus-ring` nos controles, alvo de toque 44px no mobile, `motion-reduce` nas animações.
- Escopo pequeno: uma melhoria por tarefa. Não refatore o que não foi pedido.

## Decisões travadas

- **Tiers:** S A B C D E (E é o pior). `TIER_VALUE = {S:5,A:4,B:3,C:2,D:1,E:0}` — não reindexar.
- **Cor dos tiers:** rampa oklch azul→magenta, `--tier-s` (h 220) a `--tier-e` (h 358), texto `--tier-foreground`. Aplicada via `tierColor`/`tierBg` em `TierPicker.tsx`. Não usar paleta dourada.
- **OVA/Special:** importados, podem ser canônicos, ficam **fora da média** por padrão (`includeInAverage` sobrescreve por temporada), mas **contam** no tempo assistido.
- **Não lançadas:** temporadas anunciadas vivem em `seasons` com `unreleased: true`, `releaseDate` (ISO) e `releasePrecision`; ficam **fora de todos os cálculos** (média, tempo, estatísticas, contagem). A faixa "Em breve" e os badges leem delas (`upcomingEntries`/`nextRelease`). A verificação grava direto em `seasons`; `upcoming` é só legado, convertido pelo backfill a cada load (a coluna continua no banco até a Etapa 2).
- **Ranking:** toggle `scoreMode` `"mal" | "gosto"`. MAL ordena por média MAL; Meu gosto agrupa por tier como tierlist, só com animes `watched`.
- **Ordem dentro da tier:** manual por drag & drop (`tierPosition`); `created_at` é fallback quando `tierPosition` é null. Sem ordenação numérica automática.
