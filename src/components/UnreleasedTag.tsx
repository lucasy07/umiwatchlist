/** "Em breve" tag for a season that was announced but has not premiered yet. */
export function UnreleasedTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border border-(--border-strong) bg-card-elevated px-1.5 py-px text-[9px] font-bold leading-tight text-foreground ${className}`}
    >
      Em breve
    </span>
  );
}
