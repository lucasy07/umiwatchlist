import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

type SegmentedOption<T extends string> = {
  value: T;
  ariaLabel?: string;
  content: ReactNode;
};

type SegmentedToggleProps<T extends string> = {
  options: readonly [SegmentedOption<T>, SegmentedOption<T>];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: SegmentedToggleProps<T>) {
  const [transitionsEnabled, setTransitionsEnabled] = useState(false);
  const activeIndex = options.findIndex((option) => option.value === value);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setTransitionsEnabled(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="relative grid grid-cols-2 rounded-lg border border-border/60 bg-card p-0.5">
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-md bg-primary motion-reduce:transition-none ${
          transitionsEnabled ? "transition-transform duration-slow ease-spring" : ""
        } ${activeIndex === 1 ? "translate-x-full" : "translate-x-0"}`}
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            onClick={() => onChange(option.value)}
            aria-label={option.ariaLabel}
            aria-pressed={active}
            className={`focus-ring relative z-10 flex h-11 min-w-11 items-center justify-center rounded-md px-2.5 text-xs font-medium transition-colors duration-fast hover:bg-transparent motion-reduce:transition-none sm:h-8 sm:min-w-8 [&:has(>svg)]:w-11 [&:has(>svg)]:px-0 sm:[&:has(>svg)]:w-8 ${
              active
                ? "text-primary-foreground hover:text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.content}
          </Button>
        );
      })}
    </div>
  );
}
