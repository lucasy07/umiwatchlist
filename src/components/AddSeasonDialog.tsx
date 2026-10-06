import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { JikanSearch, type JikanPick } from "@/components/JikanSearch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Anime, type Season, parseJikanDuration, uid } from "@/lib/anime-storage";
import { getJikanAnime } from "@/lib/jikan-client";

type SeasonDetails = {
  malId: number;
  type: string | null;
  year: number | null;
  episodes: number | null;
  durationMin: number | null;
};

type AddSeasonDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animes: readonly Anime[];
  initialAnimeId: string;
  onAdd: (animeId: string, season: Season) => void;
};

export function AddSeasonDialog({
  open,
  onOpenChange,
  animes,
  initialAnimeId,
  onAdd,
}: AddSeasonDialogProps) {
  const [seasonAnimeId, setSeasonAnimeId] = useState<string>("");
  const [seasonSearch, setSeasonSearch] = useState("");
  const [seasonPick, setSeasonPick] = useState<JikanPick | null>(null);
  const [seasonDetailsLoading, setSeasonDetailsLoading] = useState(false);
  const [seasonDetails, setSeasonDetails] = useState<SeasonDetails | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setSeasonAnimeId(initialAnimeId);
      setSeasonSearch("");
      setSeasonPick(null);
      setSeasonDetails(null);
      setSeasonDetailsLoading(false);
    }
    wasOpenRef.current = open;
  }, [initialAnimeId, open]);

  async function pickSeasonEntry(pick: JikanPick) {
    setSeasonPick(pick);
    setSeasonDetails(null);
    setSeasonDetailsLoading(true);
    try {
      const data = await getJikanAnime(pick.malId, { priority: "interactive" });
      const t: string | null = data?.type ?? null;
      const y: number | null =
        data?.year ?? (data?.aired?.from ? new Date(data.aired.from).getFullYear() : null);
      setSeasonDetails({
        malId: pick.malId,
        type: t,
        year: Number.isFinite(y as number) ? (y as number) : null,
        episodes: data?.episodes ?? null,
        durationMin: parseJikanDuration(data?.duration),
      });
    } catch {
      setSeasonDetails({
        malId: pick.malId,
        type: null,
        year: null,
        episodes: null,
        durationMin: null,
      });
    } finally {
      setSeasonDetailsLoading(false);
    }
  }

  function addSeason() {
    if (!seasonAnimeId) {
      toast.error("Selecione um anime");
      return;
    }
    if (!seasonPick || seasonDetailsLoading) {
      toast.error("Escolha uma entrada");
      return;
    }
    const target = animes.find((anime) => anime.id === seasonAnimeId);
    if (!target) return;
    if (target.seasons.some((season) => season.malId === seasonPick.malId)) {
      toast.error("Essa entrada já está no anime");
      return;
    }
    const newSeason: Season = {
      id: uid(),
      name: seasonPick.title,
      malId: seasonPick.malId,
      malScore: seasonPick.score ?? null,
      year: seasonDetails?.year ?? null,
      type: seasonDetails?.type ?? null,
      episodes: seasonDetails?.episodes ?? null,
      durationMin: seasonDetails?.durationMin ?? null,
      imageUrl: seasonPick.imageUrl ?? null,
    };
    onAdd(seasonAnimeId, newSeason);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card">
        <DialogHeader>
          <DialogTitle>Nova Temporada</DialogTitle>
          <DialogDescription>Nomeie a nova temporada.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Anime</Label>
            <Select value={seasonAnimeId} onValueChange={setSeasonAnimeId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {animes.map((anime) => (
                  <SelectItem key={anime.id} value={anime.id}>
                    {anime.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="season-search">Temporada</Label>
            <JikanSearch
              id="season-search"
              value={seasonSearch}
              onChange={(value) => {
                setSeasonSearch(value);
                if (seasonPick && seasonPick.title !== value) {
                  setSeasonPick(null);
                  setSeasonDetails(null);
                  setSeasonDetailsLoading(false);
                }
              }}
              onPick={(pick) => {
                setSeasonSearch(pick.title);
                void pickSeasonEntry(pick);
              }}
              placeholder="Buscar temporada, OVA, filme…"
            />
            {seasonDetailsLoading && (
              <p className="text-xs text-muted-foreground">Buscando detalhes…</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={addSeason} disabled={!seasonPick || seasonDetailsLoading}>
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
