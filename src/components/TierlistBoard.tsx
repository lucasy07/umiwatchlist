import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { tierBg, tierColor } from "@/components/TierPicker";
import { CoverArt, DraggableCover, TierDropRow } from "@/components/TierlistDnD";
import { type Anime, type Tier, TIER_VALUE } from "@/lib/anime-storage";
import { tierDropAnimation } from "@/lib/tier-drop-animation";
import { TIERLIST_DND_INSTRUCTIONS, tierlistAnnouncements } from "@/lib/tierlist-announcements";

export const TIER_ROWS = (Object.keys(TIER_VALUE) as Tier[]).sort(
  (a, b) => TIER_VALUE[b] - TIER_VALUE[a],
);
// Espelham o stagger e a duração definidos nas animações de src/styles.css.
export const TIER_WAVE_STAGGER_MS = 70;
export const TIER_WAVE_DURATION_MS = 620;

const ROW_IDS = new Set<string>([...TIER_ROWS, "none"]);

/** Multi-container: ponteiro manda; cards têm prioridade sobre fileiras. */
const tierCollisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  const collisions = pointer.length > 0 ? pointer : rectIntersection(args);
  const cards = collisions.filter((c) => !ROW_IDS.has(String(c.id)));
  return cards.length > 0 ? cards : collisions;
};

type TierlistBoardProps = {
  /** Ranking já filtrado e ordenado; só os assistidos entram nas fileiras. */
  entries: Anime[];
  /** Fica na rota: a troca de visualização espera o arraste terminar. */
  draggingAnimeId: string | null;
  onDraggingChange: (animeId: string | null) => void;
  /** Contador da onda de entrada; 0 sem onda, a paridade alterna as animações. */
  tierWaveRun: number;
  /** Entrada das capas só na primeira carga da página (mesma regra do ranking MAL). */
  animateItems: boolean;
  enableItemViewTransitions: boolean;
  highlightId: string | null;
  onOpen: (animeId: string) => void;
  /** Solta o anime na tier `destTier`, antes de `overAnimeId` (null = fim da fileira). */
  onMove: (animeId: string, destTier: Tier | null, overAnimeId: string | null) => Promise<void>;
};

/** Tierlist do modo "Meu gosto", com drag & drop entre fileiras. */
export function TierlistBoard({
  entries,
  draggingAnimeId,
  onDraggingChange,
  tierWaveRun,
  animateItems,
  enableItemViewTransitions,
  highlightId,
  onOpen,
  onMove,
}: TierlistBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const draggingAnime = draggingAnimeId
    ? (entries.find((a) => a.id === draggingAnimeId) ?? null)
    : null;

  return (
    <div className="space-y-2">
      <DndContext
        sensors={sensors}
        collisionDetection={tierCollisionDetection}
        accessibility={{
          announcements: tierlistAnnouncements(entries),
          screenReaderInstructions: { draggable: TIERLIST_DND_INSTRUCTIONS },
        }}
        onDragStart={(e: DragStartEvent) => onDraggingChange(String(e.active.id))}
        onDragCancel={() => onDraggingChange(null)}
        onDragEnd={(e: DragEndEvent) => {
          onDraggingChange(null);
          const overId = e.over?.id;
          if (!overId) return;
          const activeId = String(e.active.id);
          if (String(overId) === activeId) return;
          const anime = entries.find((a) => a.id === activeId);
          if (!anime) return;
          const overAnime = entries.find((a) => a.id === String(overId));
          if (overAnime) {
            void onMove(anime.id, overAnime.tier, overAnime.id);
            return;
          }
          const target = overId === "none" ? null : (String(overId) as Tier);
          void onMove(anime.id, target, null);
        }}
      >
        <div className="overflow-hidden rounded-xl border border-border/60">
          {TIER_ROWS.map((t, rowIndex) => {
            const items = entries.filter((a) => a.tier === t && a.watched);
            const hasItems = items.length > 0;
            const waveVariant = tierWaveRun > 0 ? (tierWaveRun % 2 === 0 ? "b" : "a") : null;
            return (
              <TierDropRow
                key={t}
                id={t}
                listLabel={`Tier ${t}`}
                items={items.map((a) => a.id)}
                className={`border-b border-border/60 last:border-b-0 ${hasItems ? "min-h-32" : "min-h-20"} ${waveVariant ? `tier-wave-row-${waveVariant}` : ""}`}
                style={
                  {
                    "--wave-tint": `var(--tier-${t.toLowerCase()})`,
                    "--wave-delay": `${rowIndex * TIER_WAVE_STAGGER_MS}ms`,
                  } as CSSProperties
                }
                label={
                  <div className="relative flex w-12 sm:w-16 shrink-0 items-center justify-center bg-card">
                    <div className={`absolute inset-y-0 left-0 w-1.5 ${tierBg(t)}`} />
                    <span className={`font-display text-2xl font-bold sm:text-3xl ${tierColor(t)}`}>
                      {t}
                    </span>
                  </div>
                }
              >
                {items.map((anime, idx) => (
                  <li
                    key={anime.id}
                    className={`list-none ${waveVariant ? `tier-wave-card-${waveVariant}` : ""}`}
                    style={
                      {
                        viewTransitionName: enableItemViewTransitions
                          ? `anime-${anime.id}`
                          : undefined,
                        "--wave-delay": `${rowIndex * TIER_WAVE_STAGGER_MS}ms`,
                      } as CSSProperties
                    }
                  >
                    <DraggableCover
                      id={`anime-${anime.id}`}
                      anime={anime}
                      idx={idx}
                      onOpen={onOpen}
                      highlighted={highlightId === anime.id}
                      animateIn={animateItems}
                    />
                  </li>
                ))}
              </TierDropRow>
            );
          })}
          {(draggingAnimeId !== null || entries.some((a) => a.tier === null && a.watched)) && (
            <TierDropRow
              id="none"
              listLabel="Sem tier"
              items={entries.filter((a) => a.tier === null && a.watched).map((a) => a.id)}
              className={`min-h-32 border-t border-border/60 ${tierWaveRun > 0 ? `tier-wave-row-${tierWaveRun % 2 === 0 ? "b" : "a"}` : ""}`}
              style={
                {
                  "--wave-tint": "var(--muted-foreground)",
                  "--wave-delay": `${TIER_ROWS.length * TIER_WAVE_STAGGER_MS}ms`,
                } as CSSProperties
              }
              label={
                <div className="relative flex w-12 sm:w-16 shrink-0 items-center justify-center bg-card">
                  <div className="absolute inset-y-0 left-0 w-1.5 bg-muted-foreground/30" />
                  <span className="font-display text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Sem tier
                  </span>
                </div>
              }
            >
              {entries
                .filter((a) => a.tier === null && a.watched)
                .map((anime, idx) => (
                  <li
                    key={anime.id}
                    className={`list-none ${tierWaveRun > 0 ? `tier-wave-card-${tierWaveRun % 2 === 0 ? "b" : "a"}` : ""}`}
                    style={
                      {
                        viewTransitionName: enableItemViewTransitions
                          ? `anime-${anime.id}`
                          : undefined,
                        "--wave-delay": `${TIER_ROWS.length * TIER_WAVE_STAGGER_MS}ms`,
                      } as CSSProperties
                    }
                  >
                    <DraggableCover
                      id={`anime-${anime.id}`}
                      anime={anime}
                      idx={idx}
                      onOpen={onOpen}
                      highlighted={highlightId === anime.id}
                      animateIn={animateItems}
                    />
                  </li>
                ))}
            </TierDropRow>
          )}
        </div>
        {(() => {
          const overlay = (
            <DragOverlay dropAnimation={tierDropAnimation()}>
              {draggingAnime ? (
                <div className="group w-20 scale-105 rounded-lg ring-2 ring-primary/50">
                  <CoverArt anime={draggingAnime} />
                </div>
              ) : null}
            </DragOverlay>
          );
          return typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
        })()}
      </DndContext>
    </div>
  );
}
