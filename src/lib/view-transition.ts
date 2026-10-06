import { flushSync } from "react-dom";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

type ViewTransitionOptions = {
  // Classe no <html> durante a transição inteira (snapshot antigo, novo e animação),
  // para o CSS escolher nomes e animações específicos daquela troca.
  rootClass?: string;
};

// Última transição que pôs cada classe: uma transição pulada por outra resolve o
// finished depois que a nova já recolocou a classe, e não pode tirá-la.
const rootClassOwners = new Map<string, object>();

export function withViewTransition(update: () => void, options: ViewTransitionOptions = {}) {
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

  const { rootClass } = options;
  const root = document.documentElement;
  const owner = {};
  const removeRootClass = () => {
    if (!rootClass || rootClassOwners.get(rootClass) !== owner) return;
    rootClassOwners.delete(rootClass);
    root.classList.remove(rootClass);
  };
  if (rootClass) {
    rootClassOwners.set(rootClass, owner);
    root.classList.add(rootClass);
  }

  let updated = false;
  const runUpdate = () => {
    updated = true;
    flushSync(update);
  };

  try {
    const transition = startViewTransition.call(document, runUpdate);
    transition.finished.then(removeRootClass, removeRootClass);
  } catch {
    removeRootClass();
    if (!updated) update();
  }
}
