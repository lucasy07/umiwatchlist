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
