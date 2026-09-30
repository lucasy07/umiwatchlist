import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { JikanSearch, type JikanPick } from "@/components/JikanSearch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { type Anime, type CreateAnimeInput, type Season, uid } from "@/lib/anime-storage";
import { buildChain, type ChainSeason } from "@/lib/jikan-chain";

type AddAnimeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animes: readonly Anime[];
  onCreate: (input: CreateAnimeInput, toastLabel: string) => Promise<void>;
};

export function AddAnimeDialog({ open, onOpenChange, animes, onCreate }: AddAnimeDialogProps) {
  const [newAnimeName, setNewAnimeName] = useState("");
  const [newAnimeMal, setNewAnimeMal] = useState<JikanPick | null>(null);
  const [chainSeasons, setChainSeasons] = useState<ChainSeason[] | null>(null);
  const [selectedChainIds, setSelectedChainIds] = useState<Set<number>>(() => new Set());
  const [chainLoading, setChainLoading] = useState(false);
  const [chainProgress, setChainProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [chainError, setChainError] = useState(false);
  const chainAbortRef = useRef<AbortController | null>(null);

  const resetAddAnime = useCallback(() => {
    chainAbortRef.current?.abort();
    chainAbortRef.current = null;
    setNewAnimeName("");
    setNewAnimeMal(null);
    setChainSeasons(null);
    setChainLoading(false);
    setChainProgress(null);
    setChainError(false);
    setSelectedChainIds(new Set());
  }, []);

  useEffect(() => {
    if (!open) resetAddAnime();
  }, [open, resetAddAnime]);

  async function startChainFetch(pick: JikanPick) {
    chainAbortRef.current?.abort();
    const ctrl = new AbortController();
    chainAbortRef.current = ctrl;
    setChainLoading(true);
    setChainSeasons(null);
    setSelectedChainIds(new Set());
    setChainProgress({ current: 0, total: 0 });
    setChainError(false);
    try {
      const seasons = await buildChain(pick.malId, (p) => setChainProgress(p), ctrl.signal);
      if (ctrl.signal.aborted) return;
      // Ensure the picked anime itself is included (in case it was filtered or
      // the API returned nothing): fall back to the pick details.
      const finalSeasons =
        seasons.length > 0
          ? seasons
          : [
              {
                malId: pick.malId,
                title: pick.title,
                year: null,
                malScore: pick.score,
                imageUrl: pick.imageUrl,
                type: null,
                status: null,
                airedFrom: null,
                genres: [],
                episodes: null,
                durationMin: null,
              },
            ];
      setChainSeasons(finalSeasons);
      setSelectedChainIds(new Set(finalSeasons.map((season) => season.malId)));
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      console.error(err);
      toast.error("Falha ao buscar temporadas no MAL");
      setChainSeasons(null);
      setChainError(true);
    } finally {
      if (!ctrl.signal.aborted) setChainLoading(false);
    }
  }

  async function addAnime() {
    const name = newAnimeName.trim();
    if (!name) {
      toast.error("Informe o nome do anime");
      return;
    }
    if (chainLoading) return;
    const pick = newAnimeMal && newAnimeMal.title === name ? newAnimeMal : null;

    if (pick && chainSeasons && chainSeasons.length > 0) {
      const selected = chainSeasons.filter((season) => selectedChainIds.has(season.malId));
      if (selected.length === 0) {
        toast.error("Selecione ao menos uma temporada");
        return;
      }
      const existingIds = new Set<number>();
      for (const anime of animes) {
        if (anime.malId) existingIds.add(anime.malId);
        for (const season of anime.seasons) if (season.malId) existingIds.add(season.malId);
      }
      if (selected.some((season) => existingIds.has(season.malId))) {
        toast.error("Esse anime já está na sua lista");
        return;
      }
      const first = selected[0];
      if (!first) return;
      const seasons: Season[] = selected.map((season) => ({
        id: uid(),
        name: season.title,
        malId: season.malId,
        year: season.year,
        malScore: season.malScore,
        type: season.type,
        episodes: season.episodes,
        durationMin: season.durationMin,
        imageUrl: season.imageUrl ?? null,
      }));
      const payload: CreateAnimeInput = {
        name: first.title,
        cover: first.imageUrl ?? undefined,
        malId: first.malId,
        imageUrl: first.imageUrl,
        malScore: first.malScore,
        genres: first.genres,
        seasons,
      };
      await onCreate(
        payload,
        `"${first.title}" adicionado com ${seasons.length} temporada${seasons.length === 1 ? "" : "s"}`,
      );
      return;
    }

    const payload: CreateAnimeInput = {
      name,
      cover: pick?.imageUrl ?? undefined,
      malId: pick?.malId ?? null,
      imageUrl: pick?.imageUrl ?? null,
      malScore: pick?.score ?? null,
    };
    await onCreate(payload, `"${name}" adicionado`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card">
        <DialogHeader>
          <DialogTitle>Novo Anime</DialogTitle>
          <DialogDescription>Adicione um anime ao seu ranking.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="anime-name">Nome</Label>
            <JikanSearch
              id="anime-name"
              autoFocus
              value={newAnimeName}
              onChange={(value) => {
                setNewAnimeName(value);
                if (newAnimeMal && newAnimeMal.title !== value) {
                  setNewAnimeMal(null);
                  setChainSeasons(null);
                  setChainProgress(null);
                  setChainError(false);
                  chainAbortRef.current?.abort();
                  setChainLoading(false);
                }
              }}
              onPick={(pick) => {
                setNewAnimeMal(pick);
                void startChainFetch(pick);
              }}
              onEnter={() => void addAnime()}
              placeholder="Ex: Frieren"
            />
          </div>

          {chainLoading && (
            <div className="grid gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Buscando temporadas...</span>
                {chainProgress && chainProgress.total > 0 && (
                  <span>
                    {chainProgress.current} de {chainProgress.total}
                  </span>
                )}
              </div>
              {chainProgress && chainProgress.total > 0 ? (
                <Progress
                  value={(chainProgress.current / chainProgress.total) * 100}
                  className="h-2"
                />
              ) : (
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/20">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/70 motion-reduce:animate-none" />
                </div>
              )}
            </div>
          )}
          {!chainLoading && chainError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="grid gap-1.5">
                <p className="text-xs text-destructive">
                  Não foi possível buscar as temporadas no MAL.
                </p>
                {newAnimeMal && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void startChainFetch(newAnimeMal)}
                    className="h-7 w-fit gap-1.5 text-xs"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Tentar novamente
                  </Button>
                )}
              </div>
            </div>
          )}
          {!chainLoading && !chainError && chainSeasons && chainSeasons.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {selectedChainIds.size} de {chainSeasons.length} selecionada
                {chainSeasons.length === 1 ? "" : "s"}
              </p>
              <ul className="max-h-72 overflow-y-auto rounded-md border border-border p-2">
                {chainSeasons.map((season) => {
                  const checked = selectedChainIds.has(season.malId);
                  return (
                    <li
                      key={season.malId}
                      className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-muted/40"
                    >
                      <Checkbox
                        id={`chain-${season.malId}`}
                        checked={checked}
                        onCheckedChange={(value) => {
                          setSelectedChainIds((previous) => {
                            const next = new Set(previous);
                            if (value) next.add(season.malId);
                            else next.delete(season.malId);
                            return next;
                          });
                        }}
                        className="mt-1"
                      />
                      <label
                        htmlFor={`chain-${season.malId}`}
                        className="min-w-0 flex-1 cursor-pointer text-sm"
                      >
                        <span className="block">{season.title}</span>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {season.year != null && <span>{season.year}</span>}
                          {season.type && (
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                              {season.type}
                            </Badge>
                          )}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void addAnime()}
            disabled={
              chainLoading ||
              (!!chainSeasons && chainSeasons.length > 0 && selectedChainIds.size === 0)
            }
          >
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
