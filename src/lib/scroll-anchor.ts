export type AnchorCandidate = { id: string; top: number; bottom: number };

/** Cards que aparecem na viewport abaixo do header sticky, na ordem do DOM. */
export function visibleAnchors(
  candidates: AnchorCandidate[],
  topInset: number,
  viewportHeight: number,
): AnchorCandidate[] {
  return candidates.filter((c) => c.bottom > topInset && c.top < viewportHeight);
}

/**
 * Guarda a posição na viewport dos cards visíveis e devolve uma função que rola a
 * página para deixar o primeiro deles que ainda existir no mesmo lugar depois de
 * uma troca de layout (no Meu gosto, por exemplo, só aparecem os assistidos).
 * A função retorna false se nenhum deles continuou na página.
 * No topo da página não há o que ancorar: retorna null.
 */
export function captureScrollAnchor(topInset: number): (() => boolean) | null {
  if (typeof window === "undefined" || window.scrollY === 0) return null;

  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[id^="anime-"]'), (el) => {
    const rect = el.getBoundingClientRect();
    return { id: el.id, top: rect.top, bottom: rect.bottom };
  });
  const anchors = visibleAnchors(candidates, topInset, window.innerHeight);
  if (anchors.length === 0) return null;

  return () => {
    for (const anchor of anchors) {
      const el = document.getElementById(anchor.id);
      if (!el) continue;
      const delta = el.getBoundingClientRect().top - anchor.top;
      if (delta !== 0) window.scrollBy({ top: delta, behavior: "instant" });
      return true;
    }
    return false;
  };
}
