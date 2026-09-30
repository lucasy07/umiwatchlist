import { defaultDropAnimationSideEffects, type DropAnimation } from "@dnd-kit/core";

export function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Valor de `--motion-spring` (styles.css); a Web Animations API não aceita var(). */
function springEasing() {
  const value =
    typeof document === "undefined"
      ? ""
      : getComputedStyle(document.documentElement).getPropertyValue("--motion-spring").trim();
  return value || "ease-out";
}

/**
 * Soltar na tierlist: a capa volta com a curva mola do app e desce de 1.05 para 1
 * (classe `.tier-drop` em styles.css). Com movimento reduzido, solta sem animação.
 */
export function tierDropAnimation(): DropAnimation | null {
  if (prefersReducedMotion()) return null;
  return {
    duration: 260,
    easing: springEasing(),
    sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: "0" } },
      className: { dragOverlay: "tier-drop" },
    }),
  };
}
