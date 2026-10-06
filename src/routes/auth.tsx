import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import umiLockup from "@/assets/umi-lockup.png";
import loginArt from "@/assets/login-art-900.webp.asset.json";
import loginArtDesktop from "@/assets/login-art-umi-1600.webp.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Umi Watchlist" },
      { name: "description", content: "Entre ou crie sua conta para sincronizar seus animes." },
    ],
  }),
  component: AuthPage,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[A-Za-z0-9._-]+$/;

function translateAuthError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("user already")
  ) {
    return "Esse e-mail já tem conta. Tente entrar.";
  }
  if (m.includes("email not confirmed") || m.includes("not confirmed")) {
    return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
  }
  if (m.includes("rate limit") || m.includes("too many") || m.includes("for security purposes")) {
    return "Muitas tentativas. Aguarde alguns instantes.";
  }
  return "Não foi possível concluir. Tente novamente em instantes.";
}

/**
 * Arte de fundo: aparece com fade só depois de carregada, para não fazer fade de uma
 * imagem ainda vazia. Com SSR o load pode vir antes da hidratação; daí o `complete`.
 */
function useImageLoaded() {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);
  return { ref, loaded, onLoad: () => setLoaded(true) };
}

const ART_FADE = "transition-opacity duration-emphasis ease-out-soft motion-reduce:transition-none";

function AuthPage() {
  const navigate = useNavigate();
  const mobileArt = useImageLoaded();
  const desktopArt = useImageLoaded();
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    username?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resetSentEmail, setResetSentEmail] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      navigate({ to: "/" });
    }
  }, [loading, session, navigate]);

  function clearFieldError(field: "username" | "email" | "password" | "confirmPassword") {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  function switchMode(next: "signin" | "signup" | "reset") {
    setMode(next);
    setUsername("");
    setConfirmPassword("");
    setErrors({});
    setServerError(null);
    setShowPassword(false);
    setResetSentEmail(null);
  }

  function validate() {
    const next: typeof errors = {};
    if (mode === "signup") {
      const u = username.trim();
      if (!u) next.username = "Informe um nome de usuário.";
      else if (u.length < 3 || u.length > 20)
        next.username = "O nome de usuário deve ter de 3 a 20 caracteres.";
      else if (!USERNAME_RE.test(u))
        next.username = "Use apenas letras, números, ponto, hífen e underscore.";
    }
    if (!email.trim()) next.email = "Informe seu e-mail.";
    else if (!EMAIL_RE.test(email.trim())) next.email = "Formato de e-mail inválido.";
    if (mode !== "reset") {
      if (!password) next.password = "Informe sua senha.";
      else if (password.length < 6) next.password = "A senha deve ter pelo menos 6 caracteres.";
      if (mode === "signup" && password !== confirmPassword) {
        next.confirmPassword = "As senhas não coincidem.";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (mode === "reset") {
        const redirectTo = `${window.location.origin}/`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        setResetSentEmail(email);
        setPendingEmail(null);
      } else if (mode === "signup") {
        const redirectTo = `${window.location.origin}/`;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo, data: { username: username.trim() } },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Bem-vindo!");
          navigate({ to: "/" });
        } else {
          setPendingEmail(email);
          setPassword("");
          setConfirmPassword("");
          switchMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo!");
        navigate({ to: "/" });
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const message = translateAuthError(raw);
      setServerError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page relative h-dvh w-full overflow-hidden bg-background text-foreground lg:h-screen">
      <Toaster theme="dark" position="top-center" />

      <style>{`
        .auth-page {
          --auth-content-padding-y: 48px;
          --auth-lockup-height: auto;
          --auth-lockup-width: 144px;
          --auth-lockup-mb: 32px;
          --auth-form-mt: 32px;
          --auth-form-gap: 24px;
          --auth-h1-size: 24px;
        }
        @media (max-height: 720px) {
          .auth-page {
            --auth-content-padding-y: 36px;
            --auth-lockup-height: 112px;
            --auth-lockup-width: 128px;
            --auth-lockup-mb: 24px;
            --auth-form-mt: 24px;
            --auth-form-gap: 20px;
            --auth-h1-size: 20px;
          }
        }
        @media (max-height: 600px) {
          .auth-page {
            --auth-content-padding-y: 24px;
            --auth-lockup-height: 96px;
            --auth-lockup-width: 112px;
            --auth-lockup-mb: 16px;
            --auth-form-mt: 16px;
            --auth-form-gap: 16px;
            --auth-h1-size: 18px;
          }
        }
        .auth-page .auth-main {
          padding-top: var(--auth-content-padding-y);
          padding-bottom: var(--auth-content-padding-y);
        }
        .auth-page .auth-lockup {
          height: var(--auth-lockup-height);
          width: var(--auth-lockup-width);
          margin-bottom: var(--auth-lockup-mb);
        }
        .auth-page .auth-title {
          font-size: var(--auth-h1-size);
        }
        .auth-page .auth-form {
          margin-top: var(--auth-form-mt);
          gap: var(--auth-form-gap);
        }
        .auth-page input:-webkit-autofill,
        .auth-page input:-webkit-autofill:hover,
        .auth-page input:-webkit-autofill:focus,
        .auth-page input:-webkit-autofill:active {
          -webkit-text-fill-color: var(--foreground);
          caret-color: var(--foreground);
          -webkit-background-clip: text;
          background-clip: text;
          transition: background-color 600000s 0s, color 600000s 0s;
        }
        .auth-page input:autofill {
          -webkit-text-fill-color: var(--foreground);
          caret-color: var(--foreground);
          -webkit-background-clip: text;
          background-clip: text;
          transition: background-color 600000s 0s, color 600000s 0s;
        }
        @media (min-width: 1024px) {
          .auth-page .auth-main {
            padding-top: 0;
            padding-bottom: 0;
          }
          .auth-page .auth-lockup {
            height: auto;
            width: 192px;
            margin-bottom: 40px;
          }
          .auth-page .auth-title {
            font-size: 24px;
          }
          .auth-page .auth-form {
            margin-top: 32px;
            gap: 24px;
          }
        }
      `}</style>

      {/* Mobile background art strip */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-0 h-[52%] select-none lg:hidden ${ART_FADE} ${
          mobileArt.loaded ? "opacity-100" : "opacity-0"
        }`}
      >
        <img
          ref={mobileArt.ref}
          onLoad={mobileArt.onLoad}
          src={loginArt.url}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="eager"
          fetchPriority="high"
          className="h-full w-full object-cover object-[26%_50%] opacity-[0.46]"
        />
        <div className="absolute inset-0" style={{ background: "var(--gradient-scrim-mobile)" }} />
      </div>

      {/* Desktop art layer — fixed, non-scrollable */}
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 z-0 hidden w-[55%] lg:block ${ART_FADE} ${
          desktopArt.loaded ? "opacity-100" : "opacity-0"
        }`}
      >
        <img
          ref={desktopArt.ref}
          onLoad={desktopArt.onLoad}
          src={loginArtDesktop.url}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="eager"
          fetchPriority="high"
          className="h-full w-full select-none object-cover object-[25%_25%]"
        />
        {/* Scrim overlay */}
        <div className="absolute inset-0" style={{ background: "var(--gradient-scrim)" }} />
        {/* Dither layer */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.038] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Scrollable layer — covers full viewport, contains the form */}
      <div className="relative z-10 flex h-full w-full overflow-y-auto">
        <main className="auth-main flex min-h-full w-full flex-col items-center justify-center px-6 py-12 lg:w-[45%] lg:py-0">
          <div className="w-full max-w-[368px] animate-in fade-in slide-in-from-left-6 duration-emphasis motion-reduce:animate-none">
            <img
              src={umiLockup}
              alt=""
              aria-hidden="true"
              className="auth-lockup h-auto object-contain lg:w-48"
            />

            <h1 className="auth-title font-display uppercase tracking-[0.25em]" aria-live="polite">
              {mode === "signin" ? "Login" : mode === "signup" ? "Criar conta" : "Recuperar senha"}
            </h1>

            {pendingEmail && (
              <div
                className="mt-6 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                Enviamos um e-mail de confirmação para{" "}
                <span className="font-semibold text-foreground">{pendingEmail}</span>. Confira sua
                caixa de entrada e também a pasta de spam antes de entrar.
              </div>
            )}

            {resetSentEmail && (
              <div
                className="mt-6 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                Se houver uma conta associada a{" "}
                <span className="font-semibold text-foreground">{resetSentEmail}</span>, enviamos um
                link para redefinir a senha. Confira sua caixa de entrada e também a pasta de spam.
              </div>
            )}

            {serverError && (
              <div
                role="alert"
                className="mt-6 flex items-start gap-2 rounded-lg border border-destructive bg-card p-3 text-xs text-foreground"
              >
                <AlertCircle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                />
                <span>
                  {serverError}{" "}
                  {mode !== "reset" && (
                    <button
                      type="button"
                      onClick={() => switchMode("reset")}
                      className="font-semibold text-primary-on-dark underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      redefina sua senha
                    </button>
                  )}
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form grid" noValidate>
              {mode === "signup" && (
                <div className="grid gap-2">
                  <Label
                    htmlFor="username"
                    className="text-xs uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    Nome de usuário
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    maxLength={20}
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      clearFieldError("username");
                    }}
                    aria-invalid={!!errors.username}
                    aria-describedby={errors.username ? "username-error" : undefined}
                    className="h-11 min-h-11 rounded-none border-0 border-b-[1.5px] border-border-interactive bg-transparent px-0 shadow-none transition-colors focus-visible:border-b-2 focus-visible:border-b-primary focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 aria-invalid:border-b-destructive focus-visible:aria-invalid:border-b-destructive"
                  />
                  {errors.username && (
                    <p id="username-error" role="alert" className="text-xs text-destructive">
                      {errors.username}
                    </p>
                  )}
                </div>
              )}
              <div className="grid gap-2">
                <Label
                  htmlFor="email"
                  className="text-xs uppercase tracking-[0.14em] text-muted-foreground"
                >
                  E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearFieldError("email");
                  }}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  className="h-11 min-h-11 rounded-none border-0 border-b-[1.5px] border-border-interactive bg-transparent px-0 shadow-none transition-colors focus-visible:border-b-2 focus-visible:border-b-primary focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 aria-invalid:border-b-destructive focus-visible:aria-invalid:border-b-destructive"
                />
                {errors.email && (
                  <p id="email-error" role="alert" className="text-xs text-destructive">
                    {errors.email}
                  </p>
                )}
              </div>

              {mode === "reset" && (
                <p className="text-xs text-muted-foreground">
                  Enviaremos um link por e-mail para você criar uma nova senha.
                </p>
              )}

              {mode !== "reset" && (
                <div className="grid gap-2">
                  <Label
                    htmlFor="password"
                    className="text-xs uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    Senha
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearFieldError("password");
                      }}
                      aria-invalid={!!errors.password}
                      aria-describedby={errors.password ? "password-error" : undefined}
                      className="h-11 min-h-11 rounded-none border-0 border-b-[1.5px] border-border-interactive bg-transparent pl-0 pr-12 shadow-none transition-colors focus-visible:border-b-2 focus-visible:border-b-primary focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 aria-invalid:border-b-destructive focus-visible:aria-invalid:border-b-destructive"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-pressed={showPassword}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {showPassword ? (
                        <EyeOff aria-hidden="true" className="size-4" />
                      ) : (
                        <Eye aria-hidden="true" className="size-4" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p id="password-error" role="alert" className="text-xs text-destructive">
                      {errors.password}
                    </p>
                  )}
                </div>
              )}

              {mode === "signup" && (
                <div className="grid gap-2">
                  <Label
                    htmlFor="confirm-password"
                    className="text-xs uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    Confirmar senha
                  </Label>
                  <Input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      clearFieldError("confirmPassword");
                    }}
                    aria-invalid={!!errors.confirmPassword}
                    aria-describedby={errors.confirmPassword ? "confirm-password-error" : undefined}
                    className="h-11 min-h-11 rounded-none border-0 border-b-[1.5px] border-border-interactive bg-transparent px-0 shadow-none transition-colors focus-visible:border-b-2 focus-visible:border-b-primary focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 aria-invalid:border-b-destructive focus-visible:aria-invalid:border-b-destructive"
                  />
                  {errors.confirmPassword && (
                    <p
                      id="confirm-password-error"
                      role="alert"
                      className="text-xs text-destructive"
                    >
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>
              )}

              {mode === "signin" && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => switchMode("reset")}
                    className="inline-flex h-11 min-h-11 items-center rounded-sm px-1 text-xs font-semibold text-primary-on-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className="mt-2 h-12 min-h-12 w-full bg-primary uppercase tracking-[0.15em] focus-visible:ring-2 focus-visible:ring-ring"
              >
                {submitting
                  ? "Aguarde…"
                  : mode === "signin"
                    ? "Login"
                    : mode === "signup"
                      ? "Criar conta"
                      : "Enviar link"}
              </Button>
            </form>

            <div className="mt-2 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
              {mode === "signin" ? (
                <>
                  <span>Não tem conta?</span>
                  <button
                    type="button"
                    onClick={() => switchMode("signup")}
                    className="inline-flex h-11 min-h-11 items-center rounded-sm px-1 font-semibold text-primary-on-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Criar conta
                  </button>
                </>
              ) : (
                <>
                  <span>{mode === "reset" ? "Lembrou a senha?" : "Já tem conta?"}</span>
                  <button
                    type="button"
                    onClick={() => switchMode("signin")}
                    className="inline-flex h-11 min-h-11 items-center rounded-sm px-1 font-semibold text-primary-on-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Fazer login
                  </button>
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
