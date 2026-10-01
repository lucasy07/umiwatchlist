import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatReleaseDate, formatReleaseLabel } from "@/lib/anime-storage";
import type {
  FoundSeason,
  PremieredSeason,
  ScanInterruption,
  ScheduledSeason,
  UncheckedAnime,
} from "@/lib/scan-types";

const UNCHECKED_REASON: Record<UncheckedAnime["reason"], string> = {
  failed: "Jikan e AniList não responderam",
  partial: "algumas consultas falharam",
  truncated: "franquia longa, pode ter cortado",
};

type CheckResultDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aborted: { scanned: number; verified: number; total: number; reason: ScanInterruption } | null;
  available: FoundSeason[];
  premiered: PremieredSeason[];
  scheduled: ScheduledSeason[];
  unchecked: UncheckedAnime[];
  /** Animes verified only thanks to the AniList fallback. */
  viaAnilist: number;
  /** The AniList batch that completes unreleased dates failed. */
  datesFailed: boolean;
  onAdd: (found: FoundSeason) => void;
};

export function CheckResultDialog({
  open,
  onOpenChange,
  aborted,
  available,
  premiered,
  scheduled,
  unchecked,
  viaAnilist,
  datesFailed,
  onAdd,
}: CheckResultDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card">
        <DialogHeader>
          <DialogTitle>Novas temporadas</DialogTitle>
          <DialogDescription>
            {aborted?.reason === "outage"
              ? `A Jikan e o AniList parecem indisponíveis: verificação interrompida após ${aborted.scanned} de ${aborted.total} animes (${aborted.verified} verificados).`
              : aborted
                ? `Verificação cancelada em ${aborted.scanned} de ${aborted.total} animes. O resultado é parcial.`
                : "Resultado da verificação a partir do MyAnimeList."}
          </DialogDescription>
          {(viaAnilist > 0 || datesFailed) && (
            <p className="text-xs text-muted-foreground">
              {viaAnilist > 0
                ? `${viaAnilist} ${viaAnilist === 1 ? "anime verificado" : "animes verificados"} via AniList.`
                : ""}
              {viaAnilist > 0 && datesFailed ? " " : ""}
              {datesFailed ? "Não foi possível completar as datas pelo AniList." : ""}
            </p>
          )}
        </DialogHeader>
        <div className="grid gap-6">
          <section className="grid gap-2">
            <h3 className="font-display text-xs uppercase tracking-widest text-muted-foreground">
              Já disponíveis (adicionar)
            </h3>
            {available.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                Nada novo pra adicionar.
              </p>
            ) : (
              <ul className="grid gap-2">
                {available.map((f) => (
                  <li
                    key={`${f.parentId}-${f.malId}`}
                    className="flex items-center gap-2 overflow-hidden rounded-lg border border-border/60 bg-card-elevated p-2 min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">{f.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        em {f.parentName}
                        {f.type ? ` • ${f.type}` : ""}
                        {f.year ? ` • ${f.year}` : ""}
                      </p>
                    </div>
                    <Button size="sm" className="shrink-0" onClick={() => onAdd(f)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="grid gap-2">
            <h3 className="font-display text-xs uppercase tracking-widest text-muted-foreground">
              Estrearam (viraram temporadas)
            </h3>
            {premiered.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                Nenhuma estreia desde a última verificação.
              </p>
            ) : (
              <ul className="grid gap-2">
                {premiered.map((p) => (
                  <li
                    key={`${p.parentId}-${p.title}`}
                    className="overflow-hidden rounded-lg border border-border/60 bg-card-elevated p-2 min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">{p.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        em {p.parentName}
                        {p.type ? ` • ${p.type}` : ""}
                        {p.year ? ` • ${p.year}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="grid gap-2">
            <h3 className="font-display text-xs uppercase tracking-widest text-muted-foreground">
              Em breve (salvas como não lançadas)
            </h3>
            {scheduled.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                Nenhuma continuação futura nova.
              </p>
            ) : (
              <ul className="grid gap-2">
                {scheduled.map((u) => (
                  <li
                    key={`${u.parentId}-${u.title}`}
                    className="overflow-hidden rounded-lg border border-border/60 bg-card-elevated p-2 min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">{u.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        em {u.parentName} • {formatReleaseDate(u.releaseDate, u.releasePrecision)}
                        {u.releaseDate && (u.releasePrecision ?? "day") === "day"
                          ? ` • ${formatReleaseLabel(u.releaseDate)}`
                          : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {unchecked.length > 0 && (
            <section className="grid gap-2">
              <h3 className="font-display text-xs uppercase tracking-widest text-muted-foreground">
                Não verificados
              </h3>
              <ul className="grid gap-2">
                {unchecked.map((u) => (
                  <li
                    key={u.parentId}
                    className="overflow-hidden rounded-lg border border-border/60 bg-card-elevated p-2 min-w-0"
                  >
                    <p className="line-clamp-2 text-sm font-medium">{u.parentName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {UNCHECKED_REASON[u.reason]}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
