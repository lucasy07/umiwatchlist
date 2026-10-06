export type AnchorCandidate = { id: string; top: number; bottom: number };

/** Primeiro card que aparece na viewport abaixo do header sticky. */
export function pickAnchor(
  candidates: AnchorCandidate[],
  topInset: number,
  viewportHeight: number,
): AnchorCandidate | null {
  return candidates.find((c) => c.bottom > topInset && c.top < viewportHeight) ?? null;
}

/**
 * Guarda a posição na viewport do primeiro card visível e devolve uma função que
 * rola a página para deixá-lo no mesmo lugar depois de uma troca de layout.
 * No topo da página não há o que ancorar: retorna null.
 */
export function captureScrollAnchor(topInset: number): (() => void) | null {
  if (typeof window === "undefined" || window.scrollY === 0) return null;

  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[id^="anime-"]'), (el) => {
    const rect = el.getBoundingClientRect();
    return { id: el.id, top: rect.top, bottom: rect.bottom };
  });
  const anchor = pickAnchor(candidates, topInset, window.innerHeight);
  if (!anchor) return null;

  return () => {
    const el = document.getElementById(anchor.id);
    if (!el) return;
    const delta = el.getBoundingClientRect().top - anchor.top;
    if (delta !== 0) window.scrollBy({ top: delta, behavior: "instant" });
  };
}

/**
 * Marca com `data-vt-near` os cards do ranking que cruzam a viewport, mais os `ids`
 * extras, e devolve os ids marcados. Na troca lista/grade só os marcados ganham nome
 * de view transition: cada grupo anima largura/altura na thread principal, e animar
 * dezenas de cards fora da tela derrubava a taxa de quadros.
 */
export function markCardsInViewport(ids: Iterable<string> = []): Set<string> {
  const marked = new Set(ids);
  for (const el of document.querySelectorAll<HTMLElement>("[data-vt-card]")) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight) marked.add(el.id);
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-vt-near]")) {
    if (!marked.has(el.id)) delete el.dataset.vtNear;
  }
  for (const id of marked) {
    const el = document.getElementById(id);
    if (el) el.dataset.vtNear = "";
  }
  return marked;
}
