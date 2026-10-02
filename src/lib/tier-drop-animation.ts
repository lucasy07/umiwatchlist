import { defaultDropAnimationSideEffects, type DropAnimation } from "@dnd-kit/core";

export function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function rootVar(name: string) {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Valor de `--motion-spring` (styles.css); a Web Animations API não aceita var(). */
function springEasing() {
  return rootVar("--motion-spring") || "ease-out";
}

/** `--motion-duration-slow` em ms; o dnd-kit pede número. */
function slowDurationMs() {
  const ms = Number.parseFloat(rootVar("--motion-duration-slow"));
  return Number.isFinite(ms) ? ms : 300;
}

/**
 * Soltar na tierlist: a capa volta com a curva mola do app e desce de 1.05 para 1
 * (classe `.tier-drop` em styles.css). Com movimento reduzido, solta sem animação.
 */
export function tierDropAnimation(): DropAnimation | null {
  if (prefersReducedMotion()) return null;
  return {
    duration: slowDurationMs(),
    easing: springEasing(),
    sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: "0" } },
      className: { dragOverlay: "tier-drop" },
    }),
  };
}
