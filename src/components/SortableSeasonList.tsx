import { GripVertical, Trash2 } from "lucide-react";
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
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { UnreleasedTag } from "@/components/UnreleasedTag";
import {
  type Season,
  formatReleaseDate,
  isExcludedFromAverage,
  isUnreleased,
} from "@/lib/anime-storage";

type Props = {
  seasons: Season[];
  setSeasons: React.Dispatch<React.SetStateAction<Season[]>>;
};

function SortableSeasonItem({
  season,
  setSeasons,
}: {
  season: Season;
  setSeasons: Props["setSeasons"];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: season.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const update = (patch: Partial<Season>) =>
    setSeasons((prev) => prev.map((s) => (s.id === season.id ? { ...s, ...patch } : s)));
  const remove = () => setSeasons((prev) => prev.filter((s) => s.id !== season.id));

  return (
    <li ref={setNodeRef} style={style} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-9 w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing touch-none"
          aria-label="Arrastar para reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <SeasonThumb season={season} className="h-[42px] w-[30px] rounded" />
        <Input
          value={season.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Nome"
          className="flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={remove}
          className="h-9 w-9 text-muted-foreground hover:text-destructive"
          aria-label="Remover temporada"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2 pl-8">
        <Switch
          id={`edit-season-${season.id}-average`}
          checked={!isExcludedFromAverage(season)}
          onCheckedChange={(checked) => update({ includeInAverage: checked })}
        />
        <Label
          htmlFor={`edit-season-${season.id}-average`}
          className="text-xs text-muted-foreground"
        >
          Na média
        </Label>
        {isUnreleased(season) && (
          <span className="ml-auto flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <UnreleasedTag />
            <span className="truncate">
              {formatReleaseDate(season.releaseDate, season.releasePrecision)}
            </span>
          </span>
        )}
      </div>
    </li>
  );
}

export function SortableSeasonList({ seasons, setSeasons }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSeasons((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={seasons.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <ul className="grid gap-2">
          {seasons.map((s) => (
            <SortableSeasonItem key={s.id} season={s} setSeasons={setSeasons} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
