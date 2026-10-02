import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 px-6 py-16 text-center animate-in fade-in-0 slide-in-from-bottom-2 duration-slow motion-reduce:animate-none sm:py-20">
      <div className="relative mb-4">
        <div aria-hidden className="absolute inset-0 rounded-full bg-primary/20 blur-2xl" />
        <div
          className="relative flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          <Icon className="h-7 w-7 text-primary-foreground" />
        </div>
      </div>
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
