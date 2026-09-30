import { defaultDropAnimationSideEffects, type DropAnimation } from "@dnd-kit/core";

export function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Soltar na tierlist: a capa volta com a curva mola do app e desce de 1.05 para 1
 * (classe `.tier-drop` em styles.css). Com movimento reduzido, solta sem animação.
 */
export function tierDropAnimation(): DropAnimation | null {
  if (prefersReducedMotion()) return null;
  return {
    duration: 260,
    easing: "cubic-bezier(0.34, 1.3, 0.64, 1)",
    sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: "0" } },
      className: { dragOverlay: "tier-drop" },
    }),
  };
}
