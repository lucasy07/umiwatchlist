import { useDroppable } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Image as ImageIcon } from "lucide-react";
import type { CSSProperties } from "react";
import type { Anime } from "@/lib/anime-storage";
import { prefersReducedMotion } from "@/lib/tier-drop-animation";

export function CoverArt({ anime }: { anime: Anime }) {
  const img = anime.cover ?? anime.imageUrl;
  return (
    <div className="relative overflow-hidden rounded-lg ring-1 ring-border/50 transition-transform duration-base motion-safe:group-hover:scale-105 group-hover:ring-primary/50">
      {img ? (
        <img src={img} alt={anime.name} loading="lazy" className="aspect-[2/3] w-20 object-cover" />
      ) : (
        <div className="flex aspect-[2/3] w-20 items-center justify-center bg-secondary text-muted-foreground">
          <ImageIcon className="h-5 w-5" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 p-1.5 opacity-0 transition-opacity duration-base group-hover:opacity-100 group-focus-visible:opacity-100 bg-gradient-to-t from-background/95 to-transparent">
        <span className="line-clamp-2 text-[10px] font-medium leading-tight text-foreground">
          {anime.name}
        </span>
      </div>
    </div>
  );
}

export function DraggableCover({
  anime,
  idx,
  onOpen,
  id,
  highlighted,
  viewTransitionName,
}: {
  anime: Anime;
  idx: number;
  onOpen: (id: string) => void;
  id?: string;
  highlighted?: boolean;
  viewTransitionName?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: anime.id,
    transition: prefersReducedMotion() ? null : undefined,
  });
  return (
    <button
      ref={setNodeRef}
      id={id}
      type="button"
      {...attributes}
      {...listeners}
      onClick={() => onOpen(anime.id)}
      aria-label={anime.name}
      title={anime.name}
      className={`group relative focus-ring w-20 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-slow motion-reduce:animate-none appearance-none border-0 bg-transparent p-0 text-left touch-none ${
        isDragging ? "opacity-40" : ""
      } ${
        highlighted
          ? "ring-2 ring-primary shadow-[var(--shadow-elegant)] animate-pulse motion-reduce:animate-none"
          : ""
      }`}
      style={{
        animationDelay: `${Math.min(idx, 12) * 30}ms`,
        transform: CSS.Transform.toString(transform),
        transition,
        viewTransitionName: isDragging ? undefined : viewTransitionName,
      }}
    >
      <CoverArt anime={anime} />
      <span className="mt-1 line-clamp-2 text-[10px] leading-tight text-muted-foreground sm:hidden">
        {anime.name}
      </span>
    </button>
  );
}

export function TierDropRow({
  id,
  items,
  children,
  className,
  label,
  listLabel,
  style,
}: {
  id: string;
  items: string[];
  children: React.ReactNode;
  className?: string;
  label: React.ReactNode;
  /** Nome acessível da fileira; a letra visual (`label`) fica oculta do leitor de tela. */
  listLabel: string;
  style?: CSSProperties;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex min-h-20 items-stretch transition-colors duration-fast motion-reduce:transition-none ${
        isOver ? "bg-primary/5 ring-1 ring-inset ring-primary/40" : ""
      } ${className ?? ""}`}
    >
      <div aria-hidden="true" className="relative z-10 flex">
        {label}
      </div>
      <ul
        aria-label={listLabel}
        className="relative z-10 flex flex-1 flex-wrap content-center items-center gap-2.5 p-3"
      >
        <SortableContext items={items} strategy={rectSortingStrategy}>
          {children}
        </SortableContext>
      </ul>
    </div>
  );
}
