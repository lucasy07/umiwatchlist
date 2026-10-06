import { flushSync } from "react-dom";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

type ViewTransitionOptions = {
  /** Roda depois do DOM atualizado e antes do snapshot novo (ex.: ajustar o scroll). */
  afterUpdate?: () => void;
};

export function withViewTransition(update: () => void, options: ViewTransitionOptions = {}) {
  const { afterUpdate } = options;
  const updateNow = () => {
    flushSync(update);
    afterUpdate?.();
  };

  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    if (afterUpdate) updateNow();
    else update();
    return;
  }

  const startViewTransition = (document as ViewTransitionDocument).startViewTransition;
  if (!startViewTransition) {
    if (afterUpdate) updateNow();
    else update();
    return;
  }

  let updated = false;
  const runUpdate = () => {
    updated = true;
    updateNow();
  };

  try {
    startViewTransition.call(document, runUpdate);
  } catch {
    if (!updated) {
      if (afterUpdate) updateNow();
      else update();
    }
  }
}
