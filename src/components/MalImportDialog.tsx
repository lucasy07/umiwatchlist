import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ExternalLink, FileUp } from "lucide-react";
import { toast } from "sonner";

import type { Anime } from "@/lib/anime-storage";
import {
  parseMalExport,
  runMalImport,
  type MalEntry,
  type MalImportSummary,
  type MalStatus,
} from "@/lib/mal-import";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

type ImportStep = "file" | "preview" | "importing" | "summary";

type MalImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animes: readonly Anime[];
  onCreated: (anime: Anime) => void;
  onUpdated: (anime: Anime) => void;
};

const STATUS_LABELS: Array<{ status: MalStatus; label: string }> = [
  { status: "completed", label: "Completed" },
  { status: "watching", label: "Watching" },
  { status: "on_hold", label: "On-Hold" },
  { status: "dropped", label: "Dropped" },
  { status: "plan_to_watch", label: "Plan to Watch" },
];

const EMPTY_SUMMARY: MalImportSummary = {
  created: 0,
  alreadyInList: 0,
  ignoredPlanToWatch: 0,
  linkedToExisting: [],
  failed: [],
};

export function MalImportDialog({
  open,
  onOpenChange,
  animes,
  onCreated,
  onUpdated,
}: MalImportDialogProps) {
  const [step, setStep] = useState<ImportStep>("file");
  const [entries, setEntries] = useState<MalEntry[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, currentName: "" });
  const [summary, setSummary] = useState<MalImportSummary>(EMPTY_SUMMARY);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep("file");
      setEntries([]);
      setParseError(null);
      setParsing(false);
      setProgress({ done: 0, total: 0, currentName: "" });
      setSummary(EMPTY_SUMMARY);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const existingMalIds = useMemo(() => {
    const ids = new Set<number>();
    for (const anime of animes) {
      if (anime.malId != null) ids.add(anime.malId);
      for (const season of anime.seasons) if (season.malId != null) ids.add(season.malId);
    }
    return ids;
  }, [animes]);

  const statusCounts = useMemo(
    () =>
      new Map(
        STATUS_LABELS.map(({ status }) => [
          status,
          entries.filter((entry) => entry.status === status).length,
        ]),
      ),
    [entries],
  );
  const alreadyInList = entries.filter((entry) => existingMalIds.has(entry.malId)).length;

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setParsing(true);
    setParseError(null);
    try {
      const parsed = await parseMalExport(file);
      setEntries(parsed);
      setStep("preview");
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Não foi possível ler a lista do MAL.",
      );
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function startImport() {
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ done: 0, total: entries.length, currentName: "" });
    setStep("importing");
    const result = await runMalImport(entries, animes, {
      signal: controller.signal,
      onProgress: setProgress,
      onCreated,
      onUpdated,
    });
    if (abortRef.current !== controller) return;
    abortRef.current = null;
    setSummary(result);
    setStep("summary");
    if (controller.signal.aborted) {
      toast("Importação cancelada", {
        description: "O que já foi importado ficou salvo.",
      });
    } else {
      toast.success(
        `${result.created} ${result.created === 1 ? "anime criado" : "animes criados"}`,
      );
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && step === "importing") abortRef.current?.abort();
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-lg"
        onInteractOutside={(event) => {
          if (step === "importing") event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (step === "importing") event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Importar do MyAnimeList</DialogTitle>
          <DialogDescription>
            {step === "file" && "Use o arquivo oficial exportado pelo MyAnimeList."}
            {step === "preview" && "Confira o conteúdo antes de iniciar a importação."}
            {step === "importing" && "Sua lista está sendo organizada por franquia."}
            {step === "summary" && "A importação foi concluída."}
          </DialogDescription>
        </DialogHeader>

        {step === "file" && (
          <div className="grid gap-4 py-1">
            <p className="text-sm text-muted-foreground">
              Exporte sua lista na página do MAL e selecione o arquivo XML ou XML.gz aqui.
            </p>
            <a
              href="https://myanimelist.net/panel.php?go=export"
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-primary hover:underline"
            >
              Abrir exportação do MyAnimeList
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 sm:min-h-0"
                disabled={parsing}
                onClick={() => fileRef.current?.click()}
              >
                <FileUp className="h-4 w-4" />
                {parsing ? "Lendo arquivo..." : "Escolher arquivo"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xml,.gz,application/xml,application/gzip"
                className="hidden"
                onChange={(event) => void chooseFile(event.target.files?.[0])}
              />
              {parseError && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {parseError}
                </p>
              )}
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="grid gap-4 py-1">
            <div className="divide-y divide-border/60 rounded-md border border-border/60">
              {STATUS_LABELS.map(({ status, label }) => (
                <div
                  key={status}
                  className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium tabular-nums">{statusCounts.get(status) ?? 0}</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Já estão na lista</span>
                <span className="font-medium tabular-nums">{alreadyInList}</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Listas grandes podem levar alguns minutos para serem importadas.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("file")}>
                Voltar
              </Button>
              <Button onClick={() => void startImport()}>Importar</Button>
            </DialogFooter>
          </div>
        )}

        {step === "importing" && (
          <div className="grid gap-4 py-1" aria-busy="true">
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="truncate text-muted-foreground">
                  {progress.currentName || "Preparando importação..."}
                </span>
                <span role="status" className="shrink-0 tabular-nums">
                  {progress.done} de {progress.total}
                </span>
              </div>
              <Progress
                value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0}
                aria-label={`Importação: ${progress.done} de ${progress.total}`}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                Cancelar
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "summary" && (
          <div className="grid gap-4 py-1">
            <div className="divide-y divide-border/60 rounded-md border border-border/60">
              <SummaryRow label="Criados" value={summary.created} />
              <SummaryRow label="Já na lista" value={summary.alreadyInList} />
              <div className="px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Continuações planejadas ignoradas</span>
                  <span className="font-medium tabular-nums">{summary.ignoredPlanToWatch}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Serão detectadas pela verificação de novas temporadas.
                </p>
              </div>
            </div>

            <SummaryList label="Ligados a anime existente" names={summary.linkedToExisting} />
            <SummaryList label="Falhas" names={summary.failed} />

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Concluir</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function SummaryList({ label, names }: { label: string; names: string[] }) {
  return (
    <details className="group rounded-md border border-border/60" open={names.length > 0}>
      <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium">
        <span>
          {label} <span className="text-muted-foreground">({names.length})</span>
        </span>
        <ChevronDown
          className="h-4 w-4 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      {names.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto border-t border-border/60 px-3 py-2 text-sm text-muted-foreground">
          {names.map((name, index) => (
            <li key={`${name}-${index}`}>{name}</li>
          ))}
        </ul>
      )}
    </details>
  );
}
