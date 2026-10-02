import { createFileRoute } from "@tanstack/react-router";
import { startTransition, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useBootProgress } from "@/boot/BootProgress";

import { BrandLockup } from "@/components/BrandLockup";
import {
  Plus,
  Search,
  Star,
  ChevronDown,
  Tv,
  Sparkles,
  X,
  LayoutGrid,
  List as ListIcon,
  Check,
  Image as ImageIcon,
  RefreshCw,
  Gauge,
  Filter,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";

import {
  type Anime,
  type CreateAnimeInput,
  type Season,
  type Tier,
  TIER_VALUE,
  compareTierlistOrder,
  fetchAnimes,
  createAnime,
  deleteAnime as deleteAnimeRow,
  updateSeasons,
  updateUpcoming,
  updateAnime,
  updateAnimeMeta,
  updateTier,
  updateTierPositions,
  updateLastCheckedAt,
  setWatched,
  importLegacyIfNeeded,
  isUnreleased,
  isVaguePrecision,
  mergeChainIntoSeasons,
  enrichUnreleasedSeasons,
  seasonFromChain,
  mediaMAL,
  releasedSeasons,
  formatLastChecked,
  allGenres,
  AWARD_GENRE,
} from "@/lib/anime-storage";
import { splitPodium } from "@/lib/ranking-podium";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/auth/AuthProvider";
import { TierPicker, tierColor, tierBg } from "@/components/TierPicker";
import { ProfileMenu } from "@/components/ProfileMenu";
import { StatsDialog } from "@/components/StatsDialog";
import { ShareTierlistDialog } from "@/components/ShareTierlistDialog";
import { UpcomingStrip } from "@/components/UpcomingStrip";
import { RankingPodium } from "@/components/RankingPodium";
import { RankingGrid } from "@/components/RankingGrid";
import { RankingList } from "@/components/RankingList";
import { MalImportDialog } from "@/components/MalImportDialog";
import { CheckResultDialog } from "@/components/CheckResultDialog";
import { MalScoreDialog } from "@/components/MalScoreDialog";
import { AnimeDetailDialog } from "@/components/AnimeDetailDialog";
import { AddAnimeDialog } from "@/components/AddAnimeDialog";
import { AddSeasonDialog } from "@/components/AddSeasonDialog";
import { SortableSeasonList } from "@/components/SortableSeasonList";
import { SeasonThumb } from "@/components/SeasonThumb";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
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
import { CoverArt, DraggableCover, TierDropRow } from "@/components/TierlistDnD";
import { tierDropAnimation } from "@/lib/tier-drop-animation";

import { buildChainDetailed, type ChainSeason } from "@/lib/jikan-chain";
import { buildAnilistChain, fetchAnilistSeasonsByMalId } from "@/lib/anilist-client";
import { getJikanAnime } from "@/lib/jikan-client";
import { runMigrations } from "@/lib/migrations";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedToggle } from "@/components/SegmentedToggle";
import { withViewTransition } from "@/lib/view-transition";
import {
  classifyChain,
  combineCheckStatus,
  isOutageStreak,
  scanOutcome,
  type CheckStatus,
  type FoundSeason,
  type PremieredSeason,
  type ScanInterruption,
  type ScanResult,
  type ScheduledSeason,
  type UncheckedAnime,
  type UpdatedSeason,
} from "@/lib/scan-types";
import { formatScore, scoreColor } from "@/lib/score-format";

const TIER_ROWS = (Object.keys(TIER_VALUE) as Tier[]).sort((a, b) => TIER_VALUE[b] - TIER_VALUE[a]);
// Espelham o stagger e a duração definidos nas animações de src/styles.css.
const TIER_WAVE_STAGGER_MS = 70;
const TIER_WAVE_DURATION_MS = 620;

const ROW_IDS = new Set<string>([...TIER_ROWS, "none"]);

/** Multi-container: ponteiro manda; cards têm prioridade sobre fileiras. */
const tierCollisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  const collisions = pointer.length > 0 ? pointer : rectIntersection(args);
  const cards = collisions.filter((c) => !ROW_IDS.has(String(c.id)));
  return cards.length > 0 ? cards : collisions;
};

export const Route = createFileRoute("/_authenticated/")({
  codeSplitGroupings: [["component"]],
  head: () => ({
    meta: [
      { title: "Minha coleção — Umi Watchlist" },
      {
        name: "description",
        content: "Organize, classifique e acompanhe sua coleção de animes no Umi Watchlist.",
      },
      { property: "og:title", content: "Minha coleção — Umi Watchlist" },
      {
        property: "og:description",
        content: "Organize, classifique e acompanhe sua coleção de animes no Umi Watchlist.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { user } = useAuth();
  const { setStep } = useBootProgress();

  const [animes, setAnimes] = useState<Anime[]>([]);
  // Latest animes for long async flows (the season check) that must not write stale snapshots.
  const animesRef = useRef<Anime[]>(animes);
  useEffect(() => {
    animesRef.current = animes;
  }, [animes]);
  const [hydrated, setHydrated] = useState(false);
  // A busca filtra o ranking inteiro, renderizado aqui mesmo. O campo é não controlado e o
  // filtro roda em transição: a digitação não espera a lista, e a próxima tecla interrompe
  // a renderização em andamento. `hasSearchText` só muda no primeiro/último caractere.
  const [search, setSearch] = useState("");
  const [hasSearchText, setHasSearchText] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  function clearSearch() {
    if (searchInputRef.current) searchInputRef.current.value = "";
    setHasSearchText(false);
    setSearch("");
  }
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [scoreMode, setScoreMode] = useState<"mal" | "gosto">("mal");
  const [displayMode, setDisplayMode] = useState<{
    scoreMode: "mal" | "gosto";
    viewMode: "list" | "grid";
  }>({ scoreMode: "mal", viewMode: "list" });
  const didInitialAnimate = useRef(false);
  const [tierFilter, setTierFilter] = useState<Set<Tier>>(() => new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(() => new Set());
  const [genreFilter, setGenreFilter] = useState<Set<string>>(() => new Set());
  const [semDadosFilter, setSemDadosFilter] = useState(false);
  const [watchedFilter, setWatchedFilter] = useState<"todos" | "nao" | "sim">("nao");
  const [draggingAnimeId, setDraggingAnimeId] = useState<string | null>(null);
  const [tierWaveRun, setTierWaveRun] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealScrollCleanupRef = useRef<(() => void) | null>(null);
  const pendingEditApplyRef = useRef<(() => void) | null>(null);
  const [watchedFlashId, setWatchedFlashId] = useState<string | null>(null);
  const watchedFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tierWaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tierSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const draggingAnime = draggingAnimeId
    ? (animes.find((a) => a.id === draggingAnimeId) ?? null)
    : null;

  const [showFilters, setShowFilters] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  // Add Anime dialog
  const [animeDialogOpen, setAnimeDialogOpen] = useState(false);

  // Add Season dialog
  const [seasonDialogOpen, setSeasonDialogOpen] = useState(false);
  const [seasonInitialAnimeId, setSeasonInitialAnimeId] = useState<string>("");

  // FAB menu
  const [fabOpen, setFabOpen] = useState(false);

  // Edit Anime dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editAnimeId, setEditAnimeId] = useState<string>("");
  const [editName, setEditName] = useState("");
  const [editCover, setEditCover] = useState<string | undefined>(undefined);
  const [editSeasons, setEditSeasons] = useState<Season[]>([]);
  const [editTier, setEditTier] = useState<Tier | null>(null);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailAnimeId, setDetailAnimeId] = useState<string>("");

  // Stats dialog
  const [statsOpen, setStatsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Check for new seasons

  const [checking, setChecking] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [checkProgress, setCheckProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [checkAborted, setCheckAborted] = useState<{
    scanned: number;
    verified: number;
    total: number;
    reason: ScanInterruption;
  } | null>(null);
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  const [foundAvailable, setFoundAvailable] = useState<FoundSeason[]>([]);
  const [foundScheduled, setFoundScheduled] = useState<ScheduledSeason[]>([]);
  const [foundPremiered, setFoundPremiered] = useState<PremieredSeason[]>([]);
  const [foundUnchecked, setFoundUnchecked] = useState<UncheckedAnime[]>([]);
  const [foundNote, setFoundNote] = useState({ viaAnilist: 0, datesFailed: false });
  const scanAbortRef = useRef<AbortController | null>(null);
  const [updatingMalScores, setUpdatingMalScores] = useState(false);
  const [malScoreProgress, setMalScoreProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [malScoreDialogOpen, setMalScoreDialogOpen] = useState(false);
  const [malScoreUpdated, setMalScoreUpdated] = useState<UpdatedSeason[]>([]);
  const malScoreAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      scanAbortRef.current?.abort();
      malScoreAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const imported = await importLegacyIfNeeded(user.id);
        setStep(2);
        if (imported > 0) {
          toast.success(
            `${imported} anime${imported === 1 ? "" : "s"} importado${imported === 1 ? "" : "s"} do dispositivo`,
          );
        }
        const data = await fetchAnimes();
        if (!cancelled) {
          setAnimes(data);
          setHydrated(true);
          setStep(3);
        }
      } catch (err) {
        console.error(err);
        toast.error("Falha ao carregar seus animes");
        if (!cancelled) setHydrated(true);
        setStep(3);
      }
    })();
    const savedView =
      typeof window !== "undefined" ? localStorage.getItem("anime-ranker:v1:view") : null;
    if (savedView === "grid" || savedView === "list") setViewMode(savedView);
    const savedScoreMode =
      typeof window !== "undefined" ? localStorage.getItem("anime-ranker:v1:scoreMode") : null;
    if (savedScoreMode === "mal" || savedScoreMode === "gosto") setScoreMode(savedScoreMode);
    const savedWatchedFilter =
      typeof window !== "undefined" ? localStorage.getItem("anime-ranker:v1:watchedFilter") : null;
    if (
      savedWatchedFilter === "todos" ||
      savedWatchedFilter === "nao" ||
      savedWatchedFilter === "sim"
    ) {
      setWatchedFilter(savedWatchedFilter);
    }
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("anime-ranker:v1:view", viewMode);
  }, [viewMode, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("anime-ranker:v1:scoreMode", scoreMode);
  }, [scoreMode, hydrated]);

  // displayMode segue o toggle, menos durante um drag na tierlist: aí espera o drop.
  // Também cobre o modo salvo carregado na hidratação.
  useEffect(() => {
    if (draggingAnimeId !== null) return;
    setDisplayMode((prev) =>
      prev.scoreMode === scoreMode && prev.viewMode === viewMode ? prev : { scoreMode, viewMode },
    );
  }, [scoreMode, viewMode, draggingAnimeId]);

  // Trocar MAL/Meu gosto ou lista/grade: os cards têm o mesmo viewTransitionName em todas
  // as visualizações, então cada um desliza e muda de tamanho até a nova posição.
  function changeRankingMode(patch: { scoreMode?: "mal" | "gosto"; viewMode?: "list" | "grid" }) {
    const apply = () => {
      if (patch.scoreMode) setScoreMode(patch.scoreMode);
      if (patch.viewMode) setViewMode(patch.viewMode);
      if (draggingAnimeId === null) setDisplayMode((prev) => ({ ...prev, ...patch }));
    };
    if (!hydrated || draggingAnimeId !== null) apply();
    else withViewTransition(apply);
  }

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("anime-ranker:v1:watchedFilter", watchedFilter);
  }, [watchedFilter, hydrated]);

  // Run all data migrations/backfills once after hydration.
  useEffect(() => {
    if (!hydrated || !user) return;
    const ctrl = new AbortController();
    const onPatch = (id: string, patch: Partial<Anime>) => {
      setAnimes((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    };
    runMigrations({ userId: user.id, animes, onPatch, signal: ctrl.signal }).catch(() => {
      // ignore
    });
    return () => {
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const lastCheckedGlobal = useMemo(() => {
    let latest: string | null = null;
    for (const a of animes) {
      if (a.lastCheckedAt && (latest === null || a.lastCheckedAt > latest))
        latest = a.lastCheckedAt;
    }
    return latest;
  }, [animes]);

  const genreOptions = useMemo(() => allGenres(animes), [animes]);
  const genreFilterLower = useMemo(
    () => new Set([...genreFilter].map((g) => g.toLowerCase())),
    [genreFilter],
  );

  function animeMatchesFilters(a: Anime, mode: "mal" | "gosto" = scoreMode) {
    const q = search.toLowerCase().trim();
    if (mode !== "gosto") {
      if (watchedFilter === "nao" && a.watched) return false;
      if (watchedFilter === "sim" && !a.watched) return false;
    }
    if (!a.name.toLowerCase().includes(q)) return false;
    if (tierFilter.size > 0 && (a.tier === null || !tierFilter.has(a.tier))) return false;
    const wantedTypes = new Set([...typeFilter].map((t) => t.toLowerCase()));
    if (
      wantedTypes.size > 0 &&
      !releasedSeasons(a.seasons).some((s) => s.type && wantedTypes.has(s.type.toLowerCase()))
    ) {
      return false;
    }
    const wantedGenres = [...genreFilter].map((g) => g.toLowerCase());
    if (wantedGenres.length > 0) {
      const have = new Set((a.genres ?? []).map((g) => g.toLowerCase()));
      if (have.size === 0) return false;
      if (!wantedGenres.every((g) => have.has(g))) return false;
    }
    if (semDadosFilter && !(a.tier === null || mediaMAL(a.seasons) === null)) return false;
    return true;
  }

  function compareByMAL(a: Anime, b: Anime) {
    const ma = mediaMAL(a.seasons);
    const mb = mediaMAL(b.seasons);
    if (ma === null && mb === null) return 0;
    if (ma === null) return 1;
    if (mb === null) return -1;
    return mb - ma;
  }

  const ranked = useMemo(() => {
    const filtered = animes.filter((anime) => animeMatchesFilters(anime));
    if (scoreMode === "gosto") {
      return [...filtered].sort(compareTierlistOrder);
    }

    return [...filtered].sort(compareByMAL);
  }, [
    animes,
    search,
    scoreMode,
    tierFilter,
    typeFilter,
    genreFilter,
    semDadosFilter,
    watchedFilter,
  ]);

  const displayedRanked = useMemo(() => {
    const filtered = animes.filter((anime) => animeMatchesFilters(anime, displayMode.scoreMode));
    if (displayMode.scoreMode === "gosto") {
      return [...filtered].sort(compareTierlistOrder);
    }
    return [...filtered].sort(compareByMAL);
  }, [
    animes,
    search,
    displayMode.scoreMode,
    tierFilter,
    typeFilter,
    genreFilter,
    semDadosFilter,
    watchedFilter,
  ]);

  // Única condição que decide o pódio e onde a lista começa.
  const podiumSplit = useMemo(
    () => splitPodium(displayedRanked, { scoreMode: displayMode.scoreMode, search }),
    [displayedRanked, displayMode.scoreMode, search],
  );

  const visibleRankingItemCount =
    displayMode.scoreMode === "gosto"
      ? displayedRanked.filter((anime) => anime.watched).length
      : displayedRanked.length;
  const enableItemViewTransitions = visibleRankingItemCount <= 60;
  const checkDisabled = checking || checkingId !== null || updatingMalScores;

  const animateRankingItems = hydrated && !didInitialAnimate.current;

  useEffect(() => {
    if (hydrated && displayedRanked.length > 0) didInitialAnimate.current = true;
  }, [hydrated, displayedRanked.length]);

  function revealAnime(id: string) {
    const el = document.getElementById(`anime-${id}`);
    if (!el) return;
    revealScrollCleanupRef.current?.();
    const flash = () => {
      setHighlightId(id);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightId((current) => (current === id ? null : current));
      }, 1200);
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.scrollIntoView({ block: "center", behavior: "auto" });
      flash();
      return;
    }
    // O flash espera a rolagem suave terminar: scrollend, ou 150ms sem scroll (card já
    // visível, ou navegador sem scrollend), com teto de 1,5s.
    let idleTimeout = setTimeout(finish, 150);
    const capTimeout = setTimeout(finish, 1500);
    const onScroll = () => {
      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(finish, 150);
    };
    function cleanup() {
      clearTimeout(idleTimeout);
      clearTimeout(capTimeout);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", finish);
      revealScrollCleanupRef.current = null;
    }
    function finish() {
      cleanup();
      flash();
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scrollend", finish);
    revealScrollCleanupRef.current = cleanup;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function addedAnimeToastOptions(created: Anime): {
    description: string;
    action?: { label: string; onClick: () => void };
  } {
    if (scoreMode === "gosto") {
      return {
        description: "Sem tier e não assistido — marque como assistido para ele entrar na tierlist",
        action: { label: "Ver", onClick: () => openDetail(created.id) },
      };
    }
    if (!animeMatchesFilters(created)) {
      return {
        description: "Escondido pelos filtros ativos",
        action: {
          label: "Ver",
          onClick: () => {
            clearSearch();
            clearFilters();
            setTimeout(() => revealAnime(created.id), 0);
          },
        },
      };
    }
    if (mediaMAL(created.seasons) === null) {
      return { description: "Sem nota do MAL ainda — vai para o fim da lista" };
    }
    const position =
      [...animes, created].sort(compareByMAL).findIndex((a) => a.id === created.id) + 1;
    return { description: `#${position} por nota MAL` };
  }

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      revealScrollCleanupRef.current?.();
      if (watchedFlashTimeoutRef.current) clearTimeout(watchedFlashTimeoutRef.current);
      if (tierWaveTimeoutRef.current) clearTimeout(tierWaveTimeoutRef.current);
    };
  }, []);

  const watchedFilterActive = scoreMode !== "gosto" && watchedFilter !== "nao";
  const filtersActive =
    tierFilter.size > 0 ||
    typeFilter.size > 0 ||
    genreFilter.size > 0 ||
    semDadosFilter ||
    watchedFilterActive;
  const filtersActiveCount =
    tierFilter.size +
    typeFilter.size +
    genreFilter.size +
    (semDadosFilter ? 1 : 0) +
    (watchedFilterActive ? 1 : 0);
  function clearFilters() {
    withViewTransition(() => {
      setTierFilter(new Set());
      setTypeFilter(new Set());
      setGenreFilter(new Set());
      setSemDadosFilter(false);
      setWatchedFilter("nao");
    });
  }
  function toggleTier(t: Tier) {
    withViewTransition(() => {
      setTierFilter((prev) => {
        const n = new Set(prev);
        if (n.has(t)) n.delete(t);
        else n.add(t);
        return n;
      });
    });
  }
  function toggleType(t: string) {
    withViewTransition(() => {
      setTypeFilter((prev) => {
        const n = new Set(prev);
        if (n.has(t)) n.delete(t);
        else n.add(t);
        return n;
      });
    });
  }
  function toggleGenre(g: string) {
    withViewTransition(() => {
      setGenreFilter((prev) => {
        const n = new Set(prev);
        if (n.has(g)) n.delete(g);
        else n.add(g);
        return n;
      });
    });
  }

  function selectGenreFilter(genre: string) {
    withViewTransition(() => setGenreFilter(new Set([genre])));
  }

  const watchedCount = useMemo(() => animes.filter((a) => a.watched).length, [animes]);
  const displayedCount = useMemo(() => {
    return scoreMode === "gosto" ? ranked.filter((a) => a.watched).length : ranked.length;
  }, [ranked, scoreMode]);
  const displayedTotal = useMemo(() => {
    return scoreMode === "gosto" ? watchedCount : animes.length;
  }, [scoreMode, watchedCount, animes.length]);
  const detailAnime = useMemo(
    () => animes.find((a) => a.id === detailAnimeId),
    [animes, detailAnimeId],
  );

  async function toggleWatched(id: string, next: boolean) {
    const prev = animes;
    setAnimes((p) => p.map((a) => (a.id === id ? { ...a, watched: next } : a)));
    try {
      await setWatched(id, next);
      toast.success(next ? "Marcado como assistido" : "Movido para a lista", {
        action: { label: "Desfazer", onClick: () => handleWatchedToggle(id, !next) },
      });
    } catch (err) {
      console.error(err);
      toast.error("Falha ao atualizar");
      setAnimes(prev);
    }
  }

  function isInRanking(anime: Anime) {
    const mode = displayMode.scoreMode;
    return animeMatchesFilters(anime, mode) && (mode !== "gosto" || anime.watched);
  }

  function handleWatchedToggle(id: string, next: boolean) {
    // animesRef: o "Desfazer" do toast chama com o closure do render em que foi criado.
    const anime = animesRef.current.find((a) => a.id === id);
    const leavesOrEntersRanking =
      anime != null && isInRanking(anime) !== isInRanking({ ...anime, watched: next });
    // Card que sai ou entra no ranking (filtro de assistidos, Meu gosto): o flash não
    // chegaria a aparecer, então ele sai/entra por view transition e os vizinhos deslizam.
    // Com o detalhe aberto, não: os cards nomeados seriam pintados acima do diálogo.
    if (leavesOrEntersRanking) {
      if (detailOpen) void toggleWatched(id, next);
      else withViewTransition(() => void toggleWatched(id, next));
      return;
    }
    if (next) {
      setWatchedFlashId(id);
      if (watchedFlashTimeoutRef.current) clearTimeout(watchedFlashTimeoutRef.current);
      watchedFlashTimeoutRef.current = setTimeout(() => {
        setWatchedFlashId((current) => (current === id ? null : current));
      }, 500);
    }
    void toggleWatched(id, next);
  }

  async function handleCreateAnime(input: CreateAnimeInput, toastLabel: string) {
    try {
      const created = await createAnime(input);
      setAnimes((prev) => [...prev, created]);
      setAnimeDialogOpen(false);
      if (scoreMode !== "gosto" && animeMatchesFilters(created)) {
        setTimeout(() => revealAnime(created.id), 0);
      }
      toast.success(toastLabel, addedAnimeToastOptions(created));
    } catch (err) {
      console.error(err);
      toast.error("Falha ao adicionar anime");
    }
  }

  function openAddSeason(animeId?: string) {
    if (animes.length === 0) {
      toast.error("Adicione um anime primeiro");
      return;
    }
    setSeasonInitialAnimeId(animeId ?? animes[0].id);
    setSeasonDialogOpen(true);
  }

  async function persistSeasons(animeId: string, seasons: Season[]) {
    try {
      await updateSeasons(animeId, seasons);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao salvar temporadas");
    }
  }

  async function handleAddSeason(animeId: string, newSeason: Season) {
    const target = animes.find((anime) => anime.id === animeId);
    if (!target) return;
    const newSeasons = [...target.seasons, newSeason];
    const prev = animes;
    setAnimes((current) =>
      current.map((anime) => (anime.id === animeId ? { ...anime, seasons: newSeasons } : anime)),
    );
    setSeasonDialogOpen(false);
    try {
      await updateSeasons(animeId, newSeasons);
      toast.success("Temporada adicionada");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao adicionar temporada");
      setAnimes(prev);
    }
  }

  async function setAnimeTier(animeId: string, tier: Tier | null) {
    const prev = animes;
    const currentTier = animes.find((anime) => anime.id === animeId)?.tier ?? null;
    const isVisibleForTier = (value: Tier | null) =>
      tierFilter.size === 0 || (value !== null && tierFilter.has(value));
    const shouldAnimate =
      scoreMode === "gosto" || isVisibleForTier(currentTier) !== isVisibleForTier(tier);
    const applyTierPatch = () => {
      setAnimes((p) => p.map((a) => (a.id === animeId ? { ...a, tier, tierPosition: null } : a)));
    };
    if (shouldAnimate) {
      withViewTransition(applyTierPatch);
    } else {
      applyTierPatch();
    }
    try {
      await updateTier(animeId, tier);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao salvar tier");
      setAnimes(prev);
    }
  }

  function tierRowOrdered(list: Anime[], destTier: Tier | null) {
    return list
      .filter((a) => a.watched && a.tier === destTier)
      .map((a, i) => ({ a, i }))
      .sort((x, y) => {
        const px = x.a.tierPosition;
        const py = y.a.tierPosition;
        if (px !== py) {
          if (px === null || px === undefined) return 1;
          if (py === null || py === undefined) return -1;
          return px - py;
        }
        return x.i - y.i;
      })
      .map(({ a }) => a);
  }

  async function moveAnimeInTierlist(
    animeId: string,
    destTier: Tier | null,
    overAnimeId: string | null,
  ) {
    const prev = animes;
    const dragged = prev.find((a) => a.id === animeId);
    if (!dragged) return;

    const tierChanged = dragged.tier !== destTier;

    let row: Anime[];
    if (!tierChanged) {
      const current = tierRowOrdered(prev, destTier);
      const oldIndex = current.findIndex((a) => a.id === animeId);
      let newIndex = current.length - 1;
      if (overAnimeId) {
        const idx = current.findIndex((a) => a.id === overAnimeId);
        if (idx !== -1) newIndex = idx;
      }
      row = oldIndex === -1 ? current : arrayMove(current, oldIndex, newIndex);
    } else {
      row = tierRowOrdered(prev, destTier).filter((a) => a.id !== animeId);
      let insertAt = row.length;
      if (overAnimeId) {
        const idx = row.findIndex((a) => a.id === overAnimeId);
        if (idx !== -1) insertAt = idx;
      }
      row.splice(insertAt, 0, dragged);
    }

    const positions = new Map(row.map((a, i) => [a.id, i] as const));

    setAnimes((p) =>
      p.map((a) => {
        const pos = positions.get(a.id);
        if (pos === undefined) return a;
        return {
          ...a,
          tier: a.id === animeId ? destTier : a.tier,
          tierPosition: pos,
        };
      }),
    );

    try {
      if (tierChanged) await updateTier(animeId, destTier);
      await updateTierPositions(row.map((a, i) => ({ id: a.id, tierPosition: i })));
    } catch (err) {
      console.error(err);
      toast.error("Falha ao salvar tier");
      setAnimes(prev);
    }
  }

  async function deleteAnime(id: string) {
    const prev = animes;
    withViewTransition(() => setAnimes((p) => p.filter((a) => a.id !== id)));
    try {
      await deleteAnimeRow(id);
      toast.success("Anime removido");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao remover");
      setAnimes(prev);
    }
  }

  async function reorderSeasons(animeId: string, from: number, to: number) {
    const target = animes.find((a) => a.id === animeId);
    if (!target) return;
    if (from === to) return;
    const originalSeasons = target.seasons;
    const newSeasons = arrayMove(originalSeasons, from, to);
    setAnimes((prev) => prev.map((a) => (a.id === animeId ? { ...a, seasons: newSeasons } : a)));
    try {
      await updateSeasons(animeId, newSeasons);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao reordenar temporadas");
      setAnimes((prev) =>
        prev.map((a) => (a.id === animeId ? { ...a, seasons: originalSeasons } : a)),
      );
    }
  }

  async function deleteSeason(animeId: string, seasonId: string) {
    const target = animes.find((a) => a.id === animeId);
    if (!target) return;
    const index = target.seasons.findIndex((s) => s.id === seasonId);
    if (index === -1) return;
    const removed = target.seasons[index];
    const originalSeasons = target.seasons;
    const newSeasons = target.seasons.filter((s) => s.id !== seasonId);
    setAnimes((prev) => prev.map((a) => (a.id === animeId ? { ...a, seasons: newSeasons } : a)));
    try {
      await updateSeasons(animeId, newSeasons);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao remover temporada");
      setAnimes((prev) =>
        prev.map((a) => (a.id === animeId ? { ...a, seasons: originalSeasons } : a)),
      );
      return;
    }
    toast("Temporada removida", {
      duration: 6000,
      action: {
        label: "Desfazer",
        onClick: async () => {
          let restored: Season[] = [];
          let base: Season[] = [];
          setAnimes((prev) =>
            prev.map((a) => {
              if (a.id !== animeId) return a;
              base = a.seasons;
              restored = [...a.seasons.slice(0, index), removed, ...a.seasons.slice(index)];
              return { ...a, seasons: restored };
            }),
          );
          try {
            await updateSeasons(animeId, restored);
          } catch (err) {
            console.error(err);
            toast.error("Falha ao desfazer");
            setAnimes((prev) => prev.map((a) => (a.id === animeId ? { ...a, seasons: base } : a)));
          }
        },
      },
    });
  }

  async function scanTargets(
    targets: Anime[],
    onProgress?: (current: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<ScanResult> {
    const result: ScanResult = {
      available: [],
      scheduled: [],
      premiered: [],
      unchecked: [],
      interruption: null,
      scanned: 0,
      verified: 0,
      viaAnilist: 0,
      datesFailed: false,
    };
    const isAbort = (err: unknown) =>
      (err instanceof DOMException && err.name === "AbortError") ||
      (err as { name?: string })?.name === "AbortError";
    const pushScheduled = (parentId: string, parentName: string, s: Season) => {
      const entry: ScheduledSeason = {
        parentId,
        parentName,
        title: s.name,
        releaseDate: s.releaseDate ?? null,
        releasePrecision: s.releasePrecision ?? null,
      };
      // The date batch may refine a season the chain just added: keep one entry per season.
      const index = result.scheduled.findIndex(
        (x) => x.parentId === parentId && x.title === s.name,
      );
      if (index === -1) result.scheduled.push(entry);
      else result.scheduled[index] = entry;
    };
    // Applies a chain to the latest state, not the snapshot from the start of a long check.
    // A partial chain is still applied: the merge only adds, never removes.
    const applyChain = async (a: Anime, chain: ChainSeason[], known: ReadonlySet<number>) => {
      const latest = animesRef.current.find((x) => x.id === a.id);
      if (!latest) return;
      const merge = mergeChainIntoSeasons(latest.seasons, chain, known);
      let saved = merge.seasons === latest.seasons;
      if (!saved) {
        try {
          await updateSeasons(a.id, merge.seasons);
          setAnimes((prev) =>
            prev.map((x) => (x.id === a.id ? { ...x, seasons: merge.seasons } : x)),
          );
          saved = true;
        } catch (err) {
          console.error("failed to persist checked seasons for", a.name, err);
        }
      }
      if (saved) {
        for (const s of [...merge.added, ...merge.rescheduled]) {
          pushScheduled(a.id, latest.name, s);
        }
        for (const s of merge.premiered) {
          result.premiered.push({
            parentId: a.id,
            parentName: latest.name,
            title: s.name,
            type: s.type ?? null,
            year: s.year ?? null,
          });
        }
      }
      for (const s of merge.available) {
        result.available.push({ ...s, parentId: a.id, parentName: latest.name });
      }
    };

    const statuses: CheckStatus[] = [];
    const jikanStatuses: CheckStatus[] = [];
    // After OUTAGE_STREAK animes without a Jikan answer, skip it and go straight to AniList.
    let jikanDown = false;
    let aborted = false;
    // malIds already handled in this check, so a franchise shared by two targets is reported once.
    const seen = new Set<number>();
    for (let i = 0; i < targets.length; i++) {
      const a = targets[i];
      let jikanStatus: CheckStatus | null = null;
      let anilistStatus: CheckStatus | null = null;
      const known = new Set(seen);
      for (const x of animesRef.current) {
        if (x.malId) known.add(x.malId);
        for (const s of x.seasons) if (s.malId) known.add(s.malId);
      }
      // Unreleased seasons of the target are fetched again to refresh their date or premiere.
      const refetch = new Set(
        (animesRef.current.find((x) => x.id === a.id) ?? a).seasons
          .filter((s) => isUnreleased(s) && s.malId)
          .map((s) => s.malId),
      );
      const knownMalIds = new Set([...known].filter((id) => !refetch.has(id)));
      const jikanIds = new Set<number>();
      if (!jikanDown) {
        try {
          const report = await buildChainDetailed(a.malId!, undefined, signal, { knownMalIds });
          jikanStatus = classifyChain(report);
          if (jikanStatus !== "failed") await applyChain(a, report.seasons, known);
          for (const s of report.seasons) jikanIds.add(s.malId);
        } catch (err) {
          if (isAbort(err)) {
            aborted = true;
            break;
          }
          console.error("check chain failed for", a.name, err);
          jikanStatus = "failed";
        }
        jikanStatuses.push(jikanStatus);
        if (isOutageStreak(jikanStatuses)) jikanDown = true;
      }
      // AniList only fills in for an incomplete Jikan answer; Jikan wins on what it returned.
      if (jikanStatus !== "verified") {
        try {
          const report = await buildAnilistChain(a.malId!, signal, { knownMalIds });
          anilistStatus = classifyChain(report);
          const chain = report.seasons.filter((s) => !jikanIds.has(s.malId));
          if (anilistStatus !== "failed") await applyChain(a, chain, known);
          for (const s of chain) seen.add(s.malId);
        } catch (err) {
          if (isAbort(err)) {
            aborted = true;
            break;
          }
          console.error("AniList chain failed for", a.name, err);
          anilistStatus = "failed";
        }
      }
      for (const id of jikanIds) seen.add(id);
      const status = combineCheckStatus(jikanStatus, anilistStatus);
      // Only a complete check counts as checked; the others are retried next time.
      if (status === "verified") {
        try {
          const iso = new Date().toISOString();
          await updateLastCheckedAt(a.id, iso);
          setAnimes((prev) => prev.map((x) => (x.id === a.id ? { ...x, lastCheckedAt: iso } : x)));
        } catch (err) {
          console.error("failed to persist last checked for", a.name, err);
        }
      }
      result.scanned += 1;
      if (status === "verified") {
        result.verified += 1;
        if (jikanStatus !== "verified") result.viaAnilist += 1;
      } else {
        result.unchecked.push({ parentId: a.id, parentName: a.name, reason: status });
      }
      onProgress?.(result.scanned, targets.length);
      statuses.push(status);
      if (isOutageStreak(statuses)) {
        result.interruption = "outage";
        break;
      }
    }
    if (!aborted && !signal?.aborted) {
      await completeUnreleasedDates(
        targets.slice(0, result.scanned),
        result,
        pushScheduled,
        signal,
      );
    }
    if (result.interruption === null && signal?.aborted) result.interruption = "cancelled";
    return result;
  }

  /**
   * One AniList batch for the undated or vague unreleased seasons of the checked animes; each
   * changed anime is written once, on the latest state. A failure only sets `datesFailed`.
   */
  async function completeUnreleasedDates(
    checked: Anime[],
    result: ScanResult,
    pushScheduled: (parentId: string, parentName: string, s: Season) => void,
    signal?: AbortSignal,
  ) {
    const ids = new Set(checked.map((a) => a.id));
    const latestOf = () => animesRef.current.filter((a) => ids.has(a.id));
    const malIds = latestOf().flatMap((a) =>
      a.seasons
        .filter(
          (s) =>
            isUnreleased(s) &&
            typeof s.malId === "number" &&
            (!s.releaseDate || isVaguePrecision(s.releasePrecision)),
        )
        .map((s) => s.malId as number),
    );
    if (malIds.length === 0) return;
    let byMalId: Map<number, ChainSeason>;
    try {
      byMalId = await fetchAnilistSeasonsByMalId(malIds, signal);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      console.error("AniList release date batch failed", err);
      result.datesFailed = true;
      return;
    }
    for (const latest of latestOf()) {
      const enriched = enrichUnreleasedSeasons(latest.seasons, byMalId);
      if (enriched.seasons === latest.seasons) continue;
      try {
        await updateSeasons(latest.id, enriched.seasons);
        setAnimes((prev) =>
          prev.map((x) => (x.id === latest.id ? { ...x, seasons: enriched.seasons } : x)),
        );
      } catch (err) {
        console.error("failed to persist release dates for", latest.name, err);
        continue;
      }
      for (const s of enriched.rescheduled) pushScheduled(latest.id, latest.name, s);
    }
  }

  function showScanResult(result: ScanResult, targetName?: string) {
    const outcome = scanOutcome(result);
    if (outcome === "allFailed") {
      toast.error(
        `Não foi possível verificar${targetName ? ` ${targetName}` : ""}: nem a Jikan nem o AniList responderam. Tente de novo em alguns minutos.`,
      );
      return;
    }
    if (outcome === "nothing") {
      toast(result.interruption ? "Verificação cancelada" : "Nenhuma temporada nova encontrada");
      return;
    }
    setFoundAvailable(result.available);
    setFoundScheduled(result.scheduled);
    setFoundPremiered(result.premiered);
    setFoundUnchecked(result.unchecked);
    setFoundNote({ viaAnilist: result.viaAnilist, datesFailed: result.datesFailed });
    setCheckDialogOpen(true);
  }

  async function checkNewSeasons() {
    if (checkingId !== null || updatingMalScores) return;
    if (checking) {
      scanAbortRef.current?.abort();
      return;
    }
    const targets = animes.filter((a) => typeof a.malId === "number" && a.malId !== null);
    if (targets.length === 0) {
      toast.error("Nenhum anime com vínculo ao MAL");
      return;
    }
    setChecking(true);
    setCheckAborted(null);
    setCheckProgress({ current: 0, total: targets.length });
    const ac = new AbortController();
    scanAbortRef.current = ac;
    let result: ScanResult;
    try {
      result = await scanTargets(
        targets,
        (current, total) => setCheckProgress({ current, total }),
        ac.signal,
      );
    } finally {
      setChecking(false);
      setCheckProgress(null);
      scanAbortRef.current = null;
    }
    if (result.interruption) {
      setCheckAborted({
        scanned: result.scanned,
        verified: result.verified,
        total: targets.length,
        reason: result.interruption,
      });
    }
    showScanResult(result);
  }

  async function checkNewSeasonsForAnime(animeId: string) {
    if (checking || checkingId || updatingMalScores) return;
    const anime = animes.find((a) => a.id === animeId);
    if (!anime) return;
    if (typeof anime.malId !== "number" || anime.malId === null) {
      toast.error("Sem vínculo ao MAL");
      return;
    }
    setCheckAborted(null);
    setCheckingId(animeId);
    let result: ScanResult;
    try {
      result = await scanTargets([anime]);
    } finally {
      setCheckingId(null);
    }
    showScanResult(result, anime.name);
  }

  async function updateMalScores() {
    if (checking || checkingId !== null) return;
    if (updatingMalScores) {
      malScoreAbortRef.current?.abort();
      return;
    }

    const total = animes.reduce(
      (count, anime) =>
        count + anime.seasons.filter((season) => typeof season.malId === "number").length,
      0,
    );
    if (total === 0) {
      toast.error("Nenhuma temporada com vínculo ao MAL");
      return;
    }

    const controller = new AbortController();
    malScoreAbortRef.current = controller;
    setUpdatingMalScores(true);
    setMalScoreProgress({ current: 0, total });
    let completed = 0;
    const updated: UpdatedSeason[] = [];

    try {
      for (const anime of animes) {
        if (controller.signal.aborted) break;
        const seasonsDraft = anime.seasons.map((season) => ({ ...season }));
        const animeUpdated: UpdatedSeason[] = [];
        let changed = false;

        for (let index = 0; index < seasonsDraft.length; index += 1) {
          if (controller.signal.aborted) break;
          const current = seasonsDraft[index];
          if (typeof current.malId !== "number") continue;

          try {
            const data = await getJikanAnime(current.malId, {
              signal: controller.signal,
              priority: "background",
            });
            const next = { ...current };
            const filledFields: string[] = [];
            const oldScore = typeof current.malScore === "number" ? current.malScore : null;

            if (typeof data.score === "number" && data.score !== oldScore) {
              next.malScore = data.score;
            }
            if (
              (current.year === null || current.year === undefined) &&
              data.year !== null &&
              data.year !== undefined
            ) {
              next.year = data.year;
              filledFields.push("year");
            }
            if (
              (current.type === null || current.type === undefined) &&
              data.type !== null &&
              data.type !== undefined
            ) {
              next.type = data.type;
              filledFields.push("type");
            }

            const seasonChanged =
              next.malScore !== current.malScore ||
              next.year !== current.year ||
              next.type !== current.type;
            if (seasonChanged) {
              seasonsDraft[index] = next;
              changed = true;
              animeUpdated.push({
                parentId: anime.id,
                parentName: anime.name,
                title: current.name,
                malId: current.malId,
                oldScore,
                newScore: typeof next.malScore === "number" ? next.malScore : null,
                filledFields,
              });
            }
          } catch {
            if (controller.signal.aborted) break;
          }

          completed += 1;
          setMalScoreProgress({ current: completed, total });
        }

        if (controller.signal.aborted) break;
        if (changed) {
          try {
            if (controller.signal.aborted) break;
            await updateSeasons(anime.id, seasonsDraft);
            setAnimes((previous) =>
              previous.map((item) =>
                item.id === anime.id
                  ? { ...item, seasons: seasonsDraft.map((season) => ({ ...season })) }
                  : item,
              ),
            );
            updated.push(...animeUpdated);
          } catch (error) {
            console.error("failed to persist MAL score updates for", anime.name, error);
          }
        }
      }
    } finally {
      setUpdatingMalScores(false);
      setMalScoreProgress(null);
      malScoreAbortRef.current = null;
    }

    if (controller.signal.aborted) {
      toast(`Atualização cancelada em ${completed} de ${total} temporadas. O resultado é parcial.`);
    }
    if (updated.length === 0) {
      if (!controller.signal.aborted) toast("Nenhuma nota mudou");
      return;
    }
    setMalScoreUpdated(updated);
    setMalScoreDialogOpen(true);
  }

  async function addFoundSeason(found: FoundSeason) {
    const target = animes.find((a) => a.id === found.parentId);
    if (!target) return;
    if (target.seasons.some((s) => s.malId === found.malId)) {
      setFoundAvailable((prev) => prev.filter((f) => f.malId !== found.malId));
      return;
    }
    const newSeasons = [...target.seasons, seasonFromChain(found)];
    setAnimes((prev) =>
      prev.map((a) => (a.id === found.parentId ? { ...a, seasons: newSeasons } : a)),
    );
    setFoundAvailable((prev) => prev.filter((f) => f.malId !== found.malId));
    try {
      await updateSeasons(found.parentId, newSeasons);
      toast.success(`"${found.title}" adicionada`);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao adicionar temporada");
      setAnimes((prev) =>
        prev.map((a) => (a.id === found.parentId ? { ...a, seasons: target.seasons } : a)),
      );
    }
  }

  function toggleExpand(id: string) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  async function clearUpcoming(animeId: string) {
    setAnimes((prev) => prev.map((a) => (a.id === animeId ? { ...a, upcoming: undefined } : a)));
    toast.success("Lançamento removido");
    try {
      await updateUpcoming(animeId, null);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao remover lançamento");
    }
  }

  function openEdit(animeId: string) {
    const a = animes.find((x) => x.id === animeId);
    if (!a) return;
    setEditAnimeId(a.id);
    setEditName(a.name);
    setEditCover(a.cover);
    setEditSeasons(a.seasons.map((s) => ({ ...s })));
    setEditTier(a.tier);
    setEditDialogOpen(true);
  }

  function openDetail(animeId: string) {
    setDetailAnimeId(animeId);
    setDetailOpen(true);
  }

  function removeEditSeason(id: string) {
    setEditSeasons((prev) => prev.filter((s) => s.id !== id));
  }

  async function saveEdit() {
    if (!editAnimeId) return;
    const name = editName.trim();
    if (!name) {
      toast.error("Informe o nome do anime");
      return;
    }
    for (const s of editSeasons) {
      if (!s.name.trim()) {
        toast.error("Toda temporada precisa de nome");
        return;
      }
    }
    const cleaned = editSeasons.map((s) => ({ ...s, name: s.name.trim() }));
    const original = animes.find((a) => a.id === editAnimeId);
    const nextTier = editTier;
    // Aplicado só quando o diálogo desmonta (onCloseAutoFocus): na view transition os cards
    // nomeados são pintados acima do snapshot da página e apareceriam por cima do diálogo.
    pendingEditApplyRef.current = () =>
      withViewTransition(() =>
        setAnimes((prev) =>
          prev.map((a) =>
            a.id === editAnimeId
              ? { ...a, name, cover: editCover, seasons: cleaned, tier: nextTier }
              : a,
          ),
        ),
      );
    setEditDialogOpen(false);
    try {
      const tasks: Promise<void>[] = [];
      if (!original || original.name !== name || original.cover !== editCover) {
        tasks.push(updateAnime(editAnimeId, { name, cover: editCover ?? null }));
      }
      tasks.push(updateSeasons(editAnimeId, cleaned));
      if (!original || original.tier !== nextTier) {
        tasks.push(updateTier(editAnimeId, nextTier));
      }
      await Promise.all(tasks);
      toast.success("Alterações salvas");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao salvar alterações");
      if (pendingEditApplyRef.current) {
        // Ainda não aplicado: basta descartar.
        pendingEditApplyRef.current = null;
      } else if (original) {
        setAnimes((prev) => prev.map((a) => (a.id === editAnimeId ? original : a)));
      }
    }
  }

  const viewToggle = (
    <SegmentedToggle
      options={[
        {
          value: "list",
          ariaLabel: "Visualização em lista",
          content: <ListIcon className="h-4 w-4" />,
        },
        {
          value: "grid",
          ariaLabel: "Visualização em grade",
          content: <LayoutGrid className="h-4 w-4" />,
        },
      ]}
      value={viewMode}
      onChange={(next) => changeRankingMode({ viewMode: next })}
    />
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster
        theme="dark"
        position="top-right"
        offset={{ top: "96px" }}
        mobileOffset={{ top: "80px" }}
      />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] sm:h-[88px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <h1 className="min-w-0 shrink-0">
            <span className="sr-only">Umi Watchlist</span>
            <button
              type="button"
              aria-label="Voltar ao topo"
              className="focus-ring cursor-pointer -m-2 p-2 transition-opacity hover:opacity-75"
              onClick={() => {
                const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
                if (displayMode.scoreMode === "gosto" && draggingAnimeId === null && !reduced) {
                  setTierWaveRun((run) => run + 1);
                  if (tierWaveTimeoutRef.current) clearTimeout(tierWaveTimeoutRef.current);
                  tierWaveTimeoutRef.current = setTimeout(
                    () => {
                      setTierWaveRun(0);
                      tierWaveTimeoutRef.current = null;
                    },
                    TIER_ROWS.length * TIER_WAVE_STAGGER_MS + TIER_WAVE_DURATION_MS + 80,
                  );
                }
              }}
            >
              <BrandLockup size="sm" className="h-11 sm:h-16" />
            </button>
          </h1>
          <div className="flex items-center gap-2 sm:gap-3">
            {scoreMode !== "gosto" && <div className="hidden md:block">{viewToggle}</div>}
            <SegmentedToggle
              options={[
                { value: "mal", ariaLabel: "Ordenar por nota do MAL", content: "MAL" },
                { value: "gosto", ariaLabel: "Ordenar pelo meu gosto", content: "Meu gosto" },
              ]}
              value={scoreMode}
              onChange={(next) => changeRankingMode({ scoreMode: next })}
            />
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              aria-label="Filtros"
              className={`focus-ring flex h-11 sm:h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                showFilters || filtersActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 bg-card text-foreground hover:border-primary/60 hover:text-primary"
              }`}
            >
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filtros</span>
              {filtersActive && (
                <span
                  className={`ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                    showFilters
                      ? "bg-primary-foreground text-primary"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {filtersActiveCount}
                </span>
              )}
            </button>
            <ProfileMenu
              onOpenStats={() => setStatsOpen(true)}
              onOpenImport={() => setImportOpen(true)}
            />
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 pb-4 sm:px-6">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              onChange={(e) => {
                const value = e.target.value;
                setHasSearchText(value !== "");
                startTransition(() => setSearch(value));
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  clearSearch();
                  searchInputRef.current?.focus();
                }
              }}
              placeholder="Buscar na sua coleção..."
              className={`h-11 border-border/60 bg-card pl-10 text-base placeholder:text-muted-foreground/70 focus-visible:ring-primary/40 ${
                hasSearchText ? "pr-12" : "pr-3"
              }`}
            />
            {hasSearchText && (
              <button
                type="button"
                aria-label="Limpar busca"
                onClick={() => {
                  clearSearch();
                  searchInputRef.current?.focus();
                }}
                className="focus-ring absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground sm:h-8 sm:w-8"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {scoreMode !== "gosto" && <div className="md:hidden">{viewToggle}</div>}
        </div>
      </header>

      {/* List */}
      <main className="mx-auto max-w-7xl px-4 pb-32 pt-6 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          {scoreMode === "gosto" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShareOpen(true)}
              className="focus-ring h-11 gap-1.5 text-xs sm:h-8"
            >
              <Share2 className="h-3.5 w-3.5" />
              Compartilhar
            </Button>
          )}
          {scoreMode !== "gosto" && (
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={checkNewSeasons}
                disabled={animes.length === 0 || checkingId !== null || updatingMalScores}
                className="group h-8 gap-1.5 text-xs"
                aria-busy={checking || undefined}
                aria-label={checking ? "Cancelar verificação" : "Verificar novas temporadas"}
                title={checking ? "Cancelar verificação" : "Verificar novas temporadas"}
              >
                {checking && checkProgress ? (
                  <>
                    <RefreshCw className="hidden h-3.5 w-3.5 animate-spin motion-reduce:animate-none sm:inline group-hover:hidden group-focus-visible:hidden" />
                    <X className="h-3.5 w-3.5 sm:hidden sm:group-hover:inline sm:group-focus-visible:inline" />
                    <span
                      role="status"
                      className="hidden sm:inline group-hover:hidden group-focus-visible:hidden"
                    >
                      Verificando{" "}
                      {checkProgress.total === 0
                        ? 0
                        : Math.round((checkProgress.current / checkProgress.total) * 100)}
                      %
                    </span>
                    <span className="sm:hidden sm:group-hover:inline sm:group-focus-visible:inline">
                      Cancelar
                    </span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Verificar novas temporadas</span>
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={updateMalScores}
                disabled={animes.length === 0 || checking || checkingId !== null}
                className="group h-8 gap-1.5 text-xs"
                aria-busy={updatingMalScores || undefined}
                aria-label={
                  updatingMalScores
                    ? "Cancelar atualização de notas do MAL"
                    : "Atualizar notas do MAL"
                }
                title={
                  updatingMalScores
                    ? "Cancelar atualização de notas do MAL"
                    : "Atualizar notas do MAL"
                }
              >
                {updatingMalScores && malScoreProgress ? (
                  <>
                    <Gauge className="hidden h-3.5 w-3.5 animate-spin motion-reduce:animate-none sm:inline group-hover:hidden group-focus-visible:hidden" />
                    <X className="h-3.5 w-3.5 sm:hidden sm:group-hover:inline sm:group-focus-visible:inline" />
                    <span
                      role="status"
                      className="hidden sm:inline group-hover:hidden group-focus-visible:hidden"
                    >
                      Atualizando{" "}
                      {malScoreProgress.total === 0
                        ? 0
                        : Math.round((malScoreProgress.current / malScoreProgress.total) * 100)}
                      %
                    </span>
                    <span className="sm:hidden sm:group-hover:inline sm:group-focus-visible:inline">
                      Cancelar
                    </span>
                  </>
                ) : (
                  <>
                    <Gauge className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Atualizar notas do MAL</span>
                  </>
                )}
              </Button>
              {!checking && (
                <span className="truncate text-[11px] text-muted-foreground">
                  {formatLastChecked(lastCheckedGlobal)}
                </span>
              )}
            </div>
          )}
          <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">
            {filtersActive || search.trim() !== ""
              ? `${displayedCount} de ${displayedTotal} animes`
              : `${displayedCount} ${displayedCount === 1 ? "anime" : "animes"}`}
          </p>
        </div>

        {showFilters && (
          <div className="mb-4 flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                Tier
              </div>
              {TIER_ROWS.map((t) => {
                const active = tierFilter.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTier(t)}
                    aria-pressed={active}
                    className={`focus-ring h-11 px-4 sm:h-7 sm:px-2.5 rounded-full border text-xs font-semibold transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/60 bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
              <div className="ml-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Tipo
              </div>
              {["TV", "Movie", "ONA"].map((t) => {
                const active = typeFilter.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    aria-pressed={active}
                    className={`focus-ring h-11 px-4 sm:h-7 sm:px-2.5 rounded-full border text-xs font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/60 bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
              {genreOptions.length > 0 && (
                <>
                  <div className="ml-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Gênero
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={`focus-ring inline-flex items-center gap-1 h-11 px-4 sm:h-7 sm:px-2.5 rounded-full border text-xs font-medium transition-colors ${
                          genreFilter.size > 0
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/60 bg-card text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Selecionar
                        {genreFilter.size > 0 && <span>({genreFilter.size})</span>}
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar gênero..." />
                        <CommandList>
                          <CommandEmpty>Nenhum gênero encontrado.</CommandEmpty>
                          <CommandGroup>
                            {genreOptions.map((g) => {
                              const active = genreFilter.has(g.name);
                              return (
                                <CommandItem
                                  key={g.name}
                                  value={g.name}
                                  onSelect={() => toggleGenre(g.name)}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${active ? "opacity-100 text-primary" : "opacity-0"}`}
                                  />
                                  <span className="flex-1 truncate">{g.name}</span>
                                  <span className="ml-2 text-[11px] tabular-nums text-muted-foreground">
                                    {g.count}
                                  </span>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                      {genreFilter.size > 0 && (
                        <div className="border-t border-border/60 p-2">
                          <button
                            type="button"
                            onClick={() => withViewTransition(() => setGenreFilter(new Set()))}
                            className="focus-ring w-full rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
                          >
                            Limpar gêneros
                          </button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  {[...genreFilter].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleGenre(g)}
                      aria-label={`Remover filtro ${g}`}
                      className="focus-ring inline-flex items-center gap-1 h-11 px-4 sm:h-7 sm:px-2.5 rounded-full border border-primary bg-primary text-xs font-medium text-primary-foreground transition-colors"
                    >
                      {g}
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                </>
              )}
              {scoreMode !== "gosto" && (
                <>
                  <div className="ml-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Assistidos
                  </div>
                  {(
                    [
                      { v: "todos", label: "Todos" },
                      { v: "nao", label: "Não assistidos" },
                      {
                        v: "sim",
                        label: `Assistidos${watchedCount > 0 ? ` (${watchedCount})` : ""}`,
                      },
                    ] as const
                  ).map((opt) => {
                    const active = watchedFilter === opt.v;
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => withViewTransition(() => setWatchedFilter(opt.v))}
                        aria-pressed={active}
                        className={`focus-ring h-11 px-4 sm:h-7 sm:px-2.5 rounded-full border text-xs font-medium transition-colors ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/60 bg-card text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </>
              )}
              <button
                type="button"
                onClick={() => withViewTransition(() => setSemDadosFilter((v) => !v))}
                aria-pressed={semDadosFilter}
                className={`focus-ring ml-2 h-11 px-4 sm:h-7 sm:px-2.5 rounded-full border text-xs font-medium transition-colors ${
                  semDadosFilter
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                Sem dados
              </button>
            </div>
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                aria-label="Limpar filtros"
                className="focus-ring inline-flex items-center gap-1.5 shrink-0 h-11 px-4 sm:h-7 sm:px-2.5 rounded-full border border-destructive/40 bg-destructive/10 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 hover:border-destructive/60"
              >
                <X className="h-3.5 w-3.5" />
                Limpar ({filtersActiveCount})
              </button>
            )}
          </div>
        )}

        <div
          style={{
            // Acima do limite os cards não têm nome; o ranking inteiro faz crossfade.
            viewTransitionName: enableItemViewTransitions ? undefined : "ranking",
          }}
        >
          {hydrated && displayMode.scoreMode === "mal" && (
            <UpcomingStrip animes={animes} onOpen={openDetail} />
          )}
          {!hydrated ? (
            <RankingSkeleton scoreMode={scoreMode} viewMode={viewMode} />
          ) : displayedRanked.length === 0 && filtersActive ? (
            <EmptyState
              icon={Filter}
              title="Nenhum anime com esses filtros."
              description="Tente afrouxar os filtros para ver mais resultados."
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              }
            />
          ) : displayedRanked.length === 0 && animes.length > 0 ? (
            <EmptyState
              icon={Search}
              title="Nenhum resultado"
              description="Tente buscar por outro nome."
            />
          ) : displayedRanked.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Comece seu ranking"
              description="Adicione seu primeiro anime e comece a notar as temporadas."
              action={
                <Button onClick={() => setAnimeDialogOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" /> Adicionar anime
                </Button>
              }
            />
          ) : displayMode.scoreMode === "gosto" ? (
            watchedCount === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="Nenhum anime assistido"
                description="Marque animes como assistidos para vê-los na sua tierlist."
              />
            ) : (
              <div className="space-y-2">
                <DndContext
                  sensors={tierSensors}
                  collisionDetection={tierCollisionDetection}
                  onDragStart={(e: DragStartEvent) => setDraggingAnimeId(String(e.active.id))}
                  onDragCancel={() => setDraggingAnimeId(null)}
                  onDragEnd={(e: DragEndEvent) => {
                    setDraggingAnimeId(null);
                    const overId = e.over?.id;
                    if (!overId) return;
                    const activeId = String(e.active.id);
                    if (String(overId) === activeId) return;
                    const anime = animes.find((a) => a.id === activeId);
                    if (!anime) return;
                    const overAnime = animes.find((a) => a.id === String(overId));
                    if (overAnime) {
                      void moveAnimeInTierlist(anime.id, overAnime.tier, overAnime.id);
                      return;
                    }
                    const target = overId === "none" ? null : (String(overId) as Tier);
                    void moveAnimeInTierlist(anime.id, target, null);
                  }}
                >
                  <div className="overflow-hidden rounded-xl border border-border/60">
                    {TIER_ROWS.map((t, rowIndex) => {
                      const items = displayedRanked.filter((a) => a.tier === t && a.watched);
                      const hasItems = items.length > 0;
                      const waveVariant =
                        tierWaveRun > 0 ? (tierWaveRun % 2 === 0 ? "b" : "a") : null;
                      return (
                        <TierDropRow
                          key={t}
                          id={t}
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
                              <span
                                className={`font-display text-2xl font-bold sm:text-3xl ${tierColor(t)}`}
                              >
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
                                onOpen={openDetail}
                                highlighted={highlightId === anime.id}
                              />
                            </li>
                          ))}
                        </TierDropRow>
                      );
                    })}
                    {(draggingAnimeId !== null ||
                      displayedRanked.some((a) => a.tier === null && a.watched)) && (
                      <TierDropRow
                        id="none"
                        items={displayedRanked
                          .filter((a) => a.tier === null && a.watched)
                          .map((a) => a.id)}
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
                        {displayedRanked
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
                                onOpen={openDetail}
                                highlighted={highlightId === anime.id}
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
                    return typeof document !== "undefined"
                      ? createPortal(overlay, document.body)
                      : overlay;
                  })()}
                </DndContext>
              </div>
            )
          ) : displayMode.viewMode === "grid" ? (
            <>
              {podiumSplit.podium && (
                <RankingPodium
                  entries={podiumSplit.podium}
                  highlightId={highlightId}
                  watchedFlashId={watchedFlashId}
                  animateRankingItems={animateRankingItems}
                  checkDisabled={checkDisabled}
                  checkingId={checkingId}
                  onOpen={openDetail}
                  onEdit={openEdit}
                  onCheckSeasons={checkNewSeasonsForAnime}
                  onToggleWatched={handleWatchedToggle}
                  onRemove={(anime) => setConfirmDelete({ id: anime.id, name: anime.name })}
                />
              )}
              <RankingGrid
                entries={podiumSplit.rest}
                offset={podiumSplit.offset}
                highlightId={highlightId}
                watchedFlashId={watchedFlashId}
                animateRankingItems={animateRankingItems}
                enableItemViewTransitions={enableItemViewTransitions}
                checkDisabled={checkDisabled}
                checkingId={checkingId}
                onOpen={openDetail}
                onEdit={openEdit}
                onAddSeason={openAddSeason}
                onCheckSeasons={checkNewSeasonsForAnime}
                onToggleWatched={handleWatchedToggle}
                onRemove={(anime) => setConfirmDelete({ id: anime.id, name: anime.name })}
              />
            </>
          ) : (
            <>
              {podiumSplit.podium && (
                <RankingPodium
                  entries={podiumSplit.podium}
                  highlightId={highlightId}
                  watchedFlashId={watchedFlashId}
                  animateRankingItems={animateRankingItems}
                  checkDisabled={checkDisabled}
                  checkingId={checkingId}
                  onOpen={openDetail}
                  onEdit={openEdit}
                  onCheckSeasons={checkNewSeasonsForAnime}
                  onToggleWatched={handleWatchedToggle}
                  onRemove={(anime) => setConfirmDelete({ id: anime.id, name: anime.name })}
                />
              )}
              <RankingList
                entries={podiumSplit.rest}
                offset={podiumSplit.offset}
                highlightId={highlightId}
                watchedFlashId={watchedFlashId}
                animateRankingItems={animateRankingItems}
                enableItemViewTransitions={enableItemViewTransitions}
                checkDisabled={checkDisabled}
                checkingId={checkingId}
                expanded={expanded}
                genreFilterLower={genreFilterLower}
                onEdit={openEdit}
                onAddSeason={openAddSeason}
                onCheckSeasons={checkNewSeasonsForAnime}
                onToggleWatched={handleWatchedToggle}
                onRemove={(anime) => setConfirmDelete({ id: anime.id, name: anime.name })}
                onToggleExpand={toggleExpand}
                onSelectAwardFilter={() => {
                  selectGenreFilter(AWARD_GENRE);
                  setShowFilters(true);
                }}
                onSetTier={setAnimeTier}
                onReorderSeasons={reorderSeasons}
                onDeleteSeason={deleteSeason}
                onClearUpcoming={clearUpcoming}
              />
            </>
          )}
        </div>
      </main>

      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
        {fabOpen && (
          <>
            <button
              onClick={() => {
                setFabOpen(false);
                openAddSeason();
              }}
              className="focus-ring flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium shadow-lg transition-transform motion-safe:hover:scale-105 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-base ease-spring motion-reduce:animate-none"
              style={{ animationDelay: "40ms" }}
            >
              <Tv className="h-4 w-4 text-primary" /> Temporada
            </button>
            <button
              onClick={() => {
                setFabOpen(false);
                setAnimeDialogOpen(true);
              }}
              className="focus-ring flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium shadow-lg transition-transform motion-safe:hover:scale-105 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-base ease-spring motion-reduce:animate-none"
            >
              <Sparkles className="h-4 w-4 text-primary" /> Anime
            </button>
          </>
        )}
        <button
          onClick={() => setFabOpen((v) => !v)}
          className="focus-ring flex h-14 w-14 items-center justify-center rounded-full text-primary-foreground ring-1 ring-primary/40 transition-transform motion-safe:hover:scale-110 motion-safe:active:scale-95"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
          aria-label="Adicionar"
        >
          <Plus
            className={`h-7 w-7 transition-transform duration-base ease-spring motion-reduce:transition-none ${fabOpen ? "rotate-45" : ""}`}
          />
        </button>
      </div>

      <AddAnimeDialog
        open={animeDialogOpen}
        onOpenChange={setAnimeDialogOpen}
        animes={animes}
        onCreate={handleCreateAnime}
      />

      <AddSeasonDialog
        open={seasonDialogOpen}
        onOpenChange={setSeasonDialogOpen}
        animes={animes}
        initialAnimeId={seasonInitialAnimeId}
        onAdd={handleAddSeason}
      />

      {/* Edit Anime Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto border-border bg-card"
          onCloseAutoFocus={() => {
            const apply = pendingEditApplyRef.current;
            pendingEditApplyRef.current = null;
            apply?.();
          }}
        >
          <DialogHeader>
            <DialogTitle>Editar anime</DialogTitle>
            <DialogDescription>Atualize o nome, a capa e as temporadas.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Capa</Label>
              {(() => {
                const editAnime = animes.find((a) => a.id === editAnimeId);
                const currentCover = editCover ?? editAnime?.imageUrl;
                const coverLabel = editCover
                  ? (editSeasons.find((s) => s.imageUrl === editCover)?.name ?? "Atual")
                  : "Padrão";
                const hasAnySeasonImage = editSeasons.some((s) => s.imageUrl);
                return (
                  <div>
                    {/* Bloco 1: capa em uso */}
                    <div className="flex items-start gap-3">
                      <div className="relative h-40 w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary">
                        {currentCover ? (
                          <img src={currentCover} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-primary/40">
                            <ImageIcon className="h-10 w-10" />
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col pt-1">
                        <span className="text-sm font-medium text-foreground">{coverLabel}</span>
                      </div>
                    </div>

                    {/* Bloco 2: alternativas */}
                    {hasAnySeasonImage ? (
                      <div className="mt-4 rounded-lg bg-secondary/40 p-3">
                        <p className="mb-2 text-xs text-muted-foreground">
                          Trocar por outra temporada
                        </p>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-2">
                          {editSeasons.map((season) => {
                            const hasImage = !!season.imageUrl;
                            const selected = !!editCover && editCover === season.imageUrl;
                            return (
                              <button
                                key={season.id}
                                type="button"
                                disabled={!hasImage}
                                onClick={() => hasImage && setEditCover(season.imageUrl!)}
                                aria-label={season.name}
                                className={`relative min-h-[44px] overflow-hidden rounded-md focus-ring transition-opacity motion-reduce:transition-none ${
                                  selected
                                    ? "opacity-100 ring-2 ring-primary"
                                    : hasImage
                                      ? "opacity-60 ring-1 ring-border/50 hover:opacity-100 focus-visible:opacity-100"
                                      : "cursor-not-allowed opacity-40 ring-1 ring-border/50"
                                }`}
                              >
                                <div className="aspect-[2/3] w-full">
                                  <SeasonThumb season={season} className="h-full w-full" alt="" />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-muted-foreground">
                        Nenhuma temporada tem capa para escolher.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-anime-name">Nome</Label>
              <Input
                id="edit-anime-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Meu tier</Label>
              <TierPicker value={editTier} onChange={setEditTier} />
            </div>
            <div className="grid gap-2">
              <Label>Temporadas</Label>
              {editSeasons.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  Nenhuma temporada
                </p>
              ) : (
                <SortableSeasonList seasons={editSeasons} setSeasons={setEditSeasons} />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check new seasons summary */}
      <CheckResultDialog
        open={checkDialogOpen}
        onOpenChange={setCheckDialogOpen}
        aborted={checkAborted}
        available={foundAvailable}
        premiered={foundPremiered}
        scheduled={foundScheduled}
        unchecked={foundUnchecked}
        viaAnilist={foundNote.viaAnilist}
        datesFailed={foundNote.datesFailed}
        onAdd={addFoundSeason}
      />

      <MalScoreDialog
        open={malScoreDialogOpen}
        onOpenChange={setMalScoreDialogOpen}
        updated={malScoreUpdated}
      />

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir anime?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove &quot;{confirmDelete?.name}&quot; e todas as suas temporadas. Esta ação
              não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) deleteAnime(confirmDelete.id);
                setConfirmDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AnimeDetailDialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetailAnimeId("");
        }}
        anime={detailAnime ?? null}
        scoreMode={scoreMode}
        checking={checking}
        checkingId={checkingId}
        updatingMalScores={updatingMalScores}
        onCheckSeasons={checkNewSeasonsForAnime}
        onToggleWatched={handleWatchedToggle}
        onEdit={(animeId) => {
          setDetailOpen(false);
          openEdit(animeId);
        }}
        onSelectGenre={(genre) => {
          setDetailOpen(false);
          setDetailAnimeId("");
          selectGenreFilter(genre);
          setShowFilters(true);
        }}
      />

      {/* Stats dialog */}
      <StatsDialog animes={animes} open={statsOpen} onOpenChange={setStatsOpen} />
      <ShareTierlistDialog animes={animes} open={shareOpen} onOpenChange={setShareOpen} />

      <MalImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        animes={animes}
        onCreated={(created) => setAnimes((prev) => [...prev, created])}
        onUpdated={(updated) =>
          setAnimes((prev) => prev.map((anime) => (anime.id === updated.id ? updated : anime)))
        }
      />
    </div>
  );
}

function RankingSkeleton({
  scoreMode,
  viewMode,
}: {
  scoreMode: "mal" | "gosto";
  viewMode: "grid" | "list";
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setVisible(true), 180);
    return () => clearTimeout(timeout);
  }, []);

  if (!visible) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Carregando…</span>
      </div>
    );
  }

  if (scoreMode === "gosto") {
    return (
      <div
        role="status"
        aria-busy="true"
        className="animate-in fade-in-0 duration-fast motion-reduce:animate-none"
      >
        <span className="sr-only">Carregando…</span>
        <div className="overflow-hidden rounded-xl border border-border/60">
          {TIER_ROWS.map((t) => (
            <div
              key={t}
              className="flex min-h-32 items-stretch border-b border-border/60 last:border-b-0"
            >
              <div className="relative flex w-12 sm:w-16 shrink-0 items-center justify-center bg-card">
                <div className={`absolute inset-y-0 left-0 w-1.5 ${tierBg(t)}`} />
                <span className={`font-display text-2xl font-bold sm:text-3xl ${tierColor(t)}`}>
                  {t}
                </span>
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-2.5 p-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    aria-hidden
                    className="aspect-[2/3] w-20 rounded-lg"
                    style={
                      { "--skeleton-delay": `${Math.min(i, 8) * 90}ms` } as React.CSSProperties
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <div
        role="status"
        aria-busy="true"
        className="animate-in fade-in-0 duration-fast motion-reduce:animate-none"
      >
        <span className="sr-only">Carregando…</span>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <li
              key={i}
              style={{ "--skeleton-delay": `${Math.min(i, 8) * 90}ms` } as React.CSSProperties}
            >
              <div
                className="overflow-hidden rounded-2xl border border-border/60"
                style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-card)" }}
              >
                <Skeleton aria-hidden className="aspect-[2/3] w-full rounded-none" />
                <div className="space-y-2 p-3">
                  <Skeleton aria-hidden className="h-4 w-3/4" />
                  <Skeleton aria-hidden className="h-3 w-1/2" />
                </div>
                <div className="flex gap-1 p-2">
                  <Skeleton aria-hidden className="h-8 flex-1" />
                  <Skeleton aria-hidden className="h-8 w-8" />
                  <Skeleton aria-hidden className="h-8 w-8" />
                  <Skeleton aria-hidden className="h-8 w-8" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-busy="true"
      className="animate-in fade-in-0 duration-fast motion-reduce:animate-none"
    >
      <span className="sr-only">Carregando…</span>
      <ul className="grid gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <li
            key={i}
            className="overflow-hidden rounded-2xl border border-border/60"
            style={
              {
                background: "var(--gradient-card)",
                boxShadow: "var(--shadow-card)",
                "--skeleton-delay": `${Math.min(i, 8) * 90}ms`,
              } as React.CSSProperties
            }
          >
            <div className="flex items-center gap-3 p-3 sm:gap-4 sm:p-5">
              <Skeleton aria-hidden className="h-10 w-8 sm:h-14 sm:w-10" />
              <Skeleton
                aria-hidden
                className="self-stretch min-h-[120px] w-20 rounded-lg sm:min-h-[168px] sm:w-28"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton aria-hidden className="h-5 w-3/4" />
                <Skeleton aria-hidden className="h-3 w-1/3" />
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Skeleton aria-hidden className="h-7 w-14" />
                <Skeleton aria-hidden className="h-3 w-8" />
                <Skeleton aria-hidden className="h-4 w-8" />
              </div>
              <Skeleton aria-hidden className="h-9 w-9 rounded-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
