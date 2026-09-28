import { useEffect, useRef, useState } from "react";
import { BarChart3, FileUp, Loader2, LogOut, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { removeAvatar, uploadAvatar } from "@/lib/avatar-upload";
import { useAvatarSrc } from "@/hooks/use-avatar-src";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const USERNAME_RE = /^[A-Za-z0-9._-]+$/;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_SIDE = 512;

/** Redimensiona no cliente para no máximo 512x512 e exporta como webp. */
async function resizeToWebp(file: File): Promise<Blob> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      el.src = bitmapUrl;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível.");
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    if (!blob) throw new Error("Falha ao converter a imagem.");
    return blob;
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

type ProfileMenuProps = {
  onOpenStats: () => void;
  onOpenImport: () => void;
};

export function ProfileMenu({ onOpenStats, onOpenImport }: ProfileMenuProps) {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const remoteSrc = useAvatarSrc(profile?.avatar_url);
  const avatarSrc = preview ?? remoteSrc;

  useEffect(() => {
    if (open) {
      setValue(profile?.username ?? "");
      setError(undefined);
    }
  }, [open, profile?.username]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const email = user?.email ?? "";
  const initial = (profile?.username?.[0] ?? email[0] ?? "?").toUpperCase();

  async function onPickFile(file: File | undefined) {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("A imagem deve ter no máximo 2 MB.");
      return;
    }

    setUploading(true);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    try {
      const blob = await resizeToWebp(file);
      await uploadAvatar(supabase, user.id, blob);
      await refreshProfile();
      toast.success("Foto de perfil atualizada!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar a foto.");
    } finally {
      setPreview(null);
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto() {
    if (!user) return;
    if (!window.confirm("Remover sua foto de perfil?")) return;
    setUploading(true);
    try {
      await removeAvatar(supabase, user.id);
      await refreshProfile();
      toast.success("Foto removida.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover a foto.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const u = value.trim();
    if (!u) return setError("Informe um nome de usuário.");
    if (u.length < 3 || u.length > 20)
      return setError("O nome de usuário deve ter de 3 a 20 caracteres.");
    if (!USERNAME_RE.test(u))
      return setError("Use apenas letras, números, ponto, hífen e underscore.");
    if (!user) return;

    setSaving(true);
    const { error: err } = await supabase
      .from("profiles")
      .update({ username: u })
      .eq("id", user.id);
    setSaving(false);

    if (err) {
      if (err.code === "23505") setError("Esse nome de usuário já está em uso.");
      else setError(err.message);
      return;
    }
    await refreshProfile();
    setOpen(false);
    toast.success("Perfil atualizado!");
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Menu do perfil"
            className="focus-ring inline-flex h-11 items-center gap-2 rounded-full ring-1 ring-border/60 transition-colors hover:ring-primary/50 sm:h-9"
          >
            <Avatar className="h-11 w-11 shrink-0 sm:h-9 sm:w-9">
              {avatarSrc && (
                <AvatarImage
                  src={avatarSrc}
                  alt={profile?.username ?? "Perfil"}
                  className="object-cover"
                />
              )}
              <AvatarFallback className="text-sm sm:text-xs">{initial}</AvatarFallback>
            </Avatar>
            {profile?.username && (
              <span className="hidden max-w-[8rem] truncate pr-3 text-sm font-medium text-foreground sm:inline">
                {profile.username}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem className="min-h-11 sm:min-h-0" onSelect={() => onOpenStats()}>
            <BarChart3 className="mr-2 h-4 w-4" />
            Estatísticas
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11 sm:min-h-0" onSelect={() => onOpenImport()}>
            <FileUp className="mr-2 h-4 w-4" />
            Importar do MyAnimeList
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11 sm:min-h-0" onSelect={() => setOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar perfil
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-11 text-destructive focus:text-destructive sm:min-h-0"
            onSelect={() => void signOut()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar perfil</DialogTitle>
            <DialogDescription>Escolha como você aparece no Umi Watchlist.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 py-1 sm:flex-row sm:items-center">
            <div className="relative" aria-busy={uploading}>
              <Avatar className="h-20 w-20">
                {avatarSrc && <AvatarImage src={avatarSrc} alt={profile?.username ?? "Perfil"} />}
                <AvatarFallback className="text-xl">{initial}</AvatarFallback>
              </Avatar>
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
                  <Loader2 className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none" />
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="focus-ring min-h-11 sm:min-h-0"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Trocar foto
              </Button>
              {profile?.avatar_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="focus-ring min-h-11 text-destructive hover:text-destructive sm:min-h-0"
                  disabled={uploading}
                  onClick={() => void removePhoto()}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remover foto
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void onPickFile(e.target.files?.[0])}
              />
            </div>
          </div>

          <div className="grid gap-2 py-1">
            <Label htmlFor="profile-username">Nome de usuário</Label>
            <Input
              id="profile-username"
              value={value}
              autoComplete="username"
              onChange={(e) => {
                setValue(e.target.value);
                setError(undefined);
              }}
              aria-invalid={!!error}
              aria-describedby={error ? "profile-username-error" : undefined}
            />
            {error && (
              <p id="profile-username-error" role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving || uploading}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={saving || uploading}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
