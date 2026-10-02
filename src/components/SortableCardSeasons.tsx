import { GripVertical, Star, Trash2, Tv } from "lucide-react";
import { SeasonThumb } from "@/components/SeasonThumb";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type Season, isExcludedFromAverage } from "@/lib/anime-storage";
import { prefersReducedMotion } from "@/lib/tier-drop-animation";

type Props = {
  seasons: Season[];
  onReorder: (from: number, to: number) => void;
  onDelete: (seasonId: string) => void;
};

function SortableRow({ season, onDelete }: { season: Season; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: season.id,
    transition: prefersReducedMotion() ? null : undefined,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg bg-secondary/60 px-3 py-2 transition-colors hover:bg-secondary"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing touch-none"
        aria-label="Arrastar para reordenar"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <SeasonThumb season={season} className="h-[42px] w-[30px] rounded" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm">{season.name}</p>
          {season.type && (
            <Badge
              variant="outline"
              title={isExcludedFromAverage(season) ? `${season.type} — fora da média` : season.type}
              className={`px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider ${
                isExcludedFromAverage(season)
                  ? "border-border/50 bg-muted/40 text-muted-foreground"
                  : "border-border/60 text-foreground/70"
              }`}
            >
              {season.type}
              {isExcludedFromAverage(season) && (
                <span className="ml-1 hidden sm:inline text-[8px] font-normal normal-case tracking-normal opacity-80">
                  fora da média
                </span>
              )}
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {season.year ?? "Ano —"}
          {season.episodes !== undefined && (
            <>
              {" · "}
              <span className="inline-flex items-center gap-0.5">
                <Tv className="h-2.5 w-2.5" />
                {typeof season.episodes === "number" && season.episodes > 0
                  ? `${season.episodes} ep`
                  : "— ep"}
              </span>
            </>
          )}
          {typeof season.malScore === "number" && (
            <>
              {" · "}
              <span className="inline-flex items-center gap-0.5">
                <Star className="h-2.5 w-2.5" />
                MAL {season.malScore.toFixed(2)}
              </span>
            </>
          )}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(season.id)}
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        aria-label="Remover temporada"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}

export function SortableCardSeasons({ seasons, onReorder, onDelete }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = seasons.findIndex((s) => s.id === active.id);
    const to = seasons.findIndex((s) => s.id === over.id);
    if (from === -1 || to === -1) return;
    onReorder(from, to);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={seasons.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <ul className="grid gap-2">
          {seasons.map((s) => (
            <SortableRow key={s.id} season={s} onDelete={onDelete} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
