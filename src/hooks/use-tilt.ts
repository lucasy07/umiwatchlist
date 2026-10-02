import { useCallback, useRef } from "react";

/**
 * 3D tilt hover effect. Returns props to spread on the element that should tilt.
 * - Respects prefers-reduced-motion (no tilt).
 * - Only activates for fine pointers (mouse). Touch/coarse pointers stay flat.
 * - Uses inline style transform + will-change during hover only.
 */
export function useTilt(options?: { max?: number; perspective?: number; scale?: number }) {
  const max = options?.max ?? 9;
  const perspective = options?.perspective ?? 800;
  const scale = options?.scale ?? 1.02;
  const ref = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const reset = useCallback((el: HTMLElement) => {
    el.style.transform = "";
    el.style.willChange = "";
    el.style.transition = "transform var(--motion-duration-fast) var(--motion-out-soft)";
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (typeof window === "undefined") return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      const ry = -px * max * 2;
      const rx = py * max * 2;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        el.style.transition = "transform 80ms ease-out";
        el.style.willChange = "transform";
        el.style.transform = `perspective(${perspective}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${scale})`;
      });
    },
    [max, perspective, scale],
  );

  const onMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      reset(e.currentTarget);
    },
    [reset],
  );

  return { ref, onMouseMove, onMouseLeave };
}
