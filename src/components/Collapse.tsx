import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { prefersReducedMotion } from "@/lib/tier-drop-animation";

/**
 * Abre e fecha animando a altura (grid-template-rows 0fr ↔ 1fr). O conteúdo só fica
 * montado enquanto aberto ou fechando; com movimento reduzido, troca na hora.
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [present, setPresent] = useState(open);
  const [expanded, setExpanded] = useState(open);

  if (open && !present) setPresent(true);

  useLayoutEffect(() => {
    if (open) {
      // Fixa o estilo em 0fr antes de abrir, para a transição ter de onde partir.
      ref.current?.getBoundingClientRect();
      setExpanded(true);
      return;
    }
    setExpanded(false);
    if (prefersReducedMotion()) setPresent(false);
  }, [open]);

  if (!present) return null;

  return (
    <div
      ref={ref}
      inert={!open}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === "grid-template-rows" && !open) {
          setPresent(false);
        }
      }}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out-soft motion-reduce:transition-none ${
        expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
