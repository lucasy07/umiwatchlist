import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, RotateCcw, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { Anime } from "@/lib/anime-storage";
import {
  renderTierlistImage,
  selectTierlistRows,
  type TierlistImageFormat,
} from "@/lib/tierlist-image";
import { SegmentedToggle } from "@/components/SegmentedToggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ShareTierlistDialogProps = {
  animes: Anime[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type GenerationState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "error" }
  | { status: "ready"; url: string; file: File; truncated: boolean; canShare: boolean };

const FORMAT_OPTIONS = [
  { value: "horizontal", content: "Horizontal" },
  { value: "story", content: "Story" },
] as const;

function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function ShareTierlistDialog({ animes, open, onOpenChange }: ShareTierlistDialogProps) {
  const [format, setFormat] = useState<TierlistImageFormat>("horizontal");
  const [state, setState] = useState<GenerationState>({ status: "idle" });
  const [retryKey, setRetryKey] = useState(0);
  const generationRef = useRef(0);

  const isEmpty = useMemo(
    () => selectTierlistRows(animes).every((row) => row.items.length === 0),
    [animes],
  );

  useEffect(() => {
    if (!open || isEmpty) {
      setState({ status: "idle" });
      return;
    }
    const generation = ++generationRef.current;
    const controller = new AbortController();
    setState({ status: "generating" });
    renderTierlistImage(animes, format, controller.signal)
      .then(({ blob, truncated }) => {
        // A newer generation (format switch, retry) owns the state now.
        if (generation !== generationRef.current) return;
        const file = new File([blob], `umi-tierlist-${format}.png`, { type: "image/png" });
        setState({
          status: "ready",
          url: URL.createObjectURL(blob),
          file,
          truncated,
          canShare: canShareFile(file),
        });
      })
      .catch((error: unknown) => {
        if (generation !== generationRef.current || controller.signal.aborted) return;
        console.error("Falha ao gerar a imagem da tierlist", error);
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [open, isEmpty, animes, format, retryKey]);

  useEffect(() => {
    if (state.status !== "ready") return;
    const { url } = state;
    return () => URL.revokeObjectURL(url);
  }, [state]);

  async function share(file: File) {
    try {
      await navigator.share({ files: [file], title: "minha tierlist" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Não foi possível compartilhar a imagem.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto border-border bg-card sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Compartilhar tierlist</DialogTitle>
          <DialogDescription>
            Gera uma imagem da sua tierlist completa, sem busca nem filtros.
          </DialogDescription>
        </DialogHeader>

        {isEmpty ? (
          <p className="rounded-lg border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
            Nenhum anime assistido está em uma tier ainda. Marque animes como assistidos e escolha
            uma tier para compartilhar sua tierlist.
          </p>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            <div className="self-start">
              <SegmentedToggle options={FORMAT_OPTIONS} value={format} onChange={setFormat} />
            </div>

            <div className="flex min-h-48 w-full items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-background/40">
              {state.status === "ready" ? (
                <img
                  src={state.url}
                  alt={`Prévia da tierlist no formato ${format === "story" ? "Story" : "Horizontal"}`}
                  className={
                    format === "story"
                      ? "max-h-[60vh] w-auto max-w-full object-contain"
                      : "w-full object-contain"
                  }
                />
              ) : state.status === "error" ? (
                <div className="flex flex-col items-center gap-3 p-6 text-center">
                  <p role="alert" className="text-sm text-muted-foreground">
                    Não foi possível gerar a imagem.
                  </p>
                  <Button
                    variant="outline"
                    className="focus-ring h-11 gap-1.5 sm:h-9"
                    onClick={() => setRetryKey((k) => k + 1)}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Tentar de novo
                  </Button>
                </div>
              ) : (
                <div
                  role="status"
                  aria-busy="true"
                  className="flex items-center gap-2 p-6 text-sm text-muted-foreground"
                >
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Gerando imagem…
                </div>
              )}
            </div>

            {state.status === "ready" && state.truncated && (
              <p className="text-xs text-muted-foreground">
                Algumas capas ficaram de fora no formato Story. O formato Horizontal mostra tudo.
              </p>
            )}

            {state.status === "ready" && (
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {state.canShare && (
                  <Button
                    variant="outline"
                    className="focus-ring h-11 gap-1.5 sm:h-9"
                    onClick={() => void share(state.file)}
                  >
                    <Share2 className="h-4 w-4" />
                    Compartilhar
                  </Button>
                )}
                <Button asChild className="focus-ring h-11 gap-1.5 sm:h-9">
                  <a href={state.url} download={state.file.name}>
                    <Download className="h-4 w-4" />
                    Baixar PNG
                  </a>
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
