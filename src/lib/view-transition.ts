import { flushSync } from "react-dom";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

export function withViewTransition(update: () => void) {
  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }

  const startViewTransition = (document as ViewTransitionDocument).startViewTransition;
  if (!startViewTransition) {
    update();
    return;
  }

  let updated = false;
  const runUpdate = () => {
    updated = true;
    flushSync(update);
  };

  try {
    startViewTransition.call(document, runUpdate);
  } catch {
    if (!updated) update();
  }
}
