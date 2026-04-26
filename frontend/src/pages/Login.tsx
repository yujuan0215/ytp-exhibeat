import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getLocaleCopy, useLanguage } from "@/lib/language";

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, user, status } = useAuth();
  const { locale } = useLanguage();
  const copy = getLocaleCopy(locale, {
    "zh-TW": {
      loginFailed: "登入失敗",
      checkingAuth: "驗證登入狀態中…",
      title: "登入",
      email: "Email",
      emailPlaceholder: "您的 Email",
      password: "密碼",
      passwordPlaceholder: "您的密碼",
      forgotPassword: "忘記密碼",
      loggingIn: "登入中…",
      login: "登入",
      or: "或是",
      comingSoon: "即將推出",
      loginWithGoogle: "透過 Google 登入",
      noAccount: "還沒有帳號？",
      registerNow: "立即註冊",
    },
    en: {
      loginFailed: "Login failed",
      checkingAuth: "Checking authentication…",
      title: "Login",
      email: "Email",
      emailPlaceholder: "Your email",
      password: "Password",
      passwordPlaceholder: "Your password",
      forgotPassword: "Forgot password",
      loggingIn: "Signing in…",
      login: "Login",
      or: "or",
      comingSoon: "Coming soon",
      loginWithGoogle: "Continue with Google",
      noAccount: "Don't have an account?",
      registerNow: "Register now",
    },
    fr: {
      loginFailed: "Échec de la connexion",
      checkingAuth: "Vérification de l'authentification…",
      title: "Connexion",
      email: "E-mail",
      emailPlaceholder: "Votre e-mail",
      password: "Mot de passe",
      passwordPlaceholder: "Au moins 8 caractères",
      forgotPassword: "Mot de passe oublié",
      loggingIn: "Connexion en cours…",
      login: "Se connecter",
      or: "ou",
      comingSoon: "Bientôt disponible",
      loginWithGoogle: "Continuer avec Google",
      noAccount: "Vous n'avez pas de compte ?",
      registerNow: "Inscrivez-vous",
    },
  });

  const requestedRedirect = (location.state as { from?: string } | null)?.from ?? "/";
  const redirectTo = requestedRedirect === "/login" || requestedRedirect === "/register" ? "/" : requestedRedirect;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.loginFailed);
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-[80vh] flex items-center justify-center text-white/60 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> {copy.checkingAuth}
      </div>
    );
  }

  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-extrabold text-white tracking-wide">{copy.title}</h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="text-sm font-semibold text-white/90 mb-2 block">{copy.email}</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 rounded-md bg-transparent border border-white/20 focus:border-primary focus:ring-1 focus:ring-primary/40 outline-none px-4 text-lg text-white placeholder:text-white/35 transition-colors"
              placeholder={copy.emailPlaceholder}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-white/90 mb-2 block">{copy.password}</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 rounded-md bg-transparent border border-white/20 focus:border-primary focus:ring-1 focus:ring-primary/40 outline-none px-4 text-lg text-white placeholder:text-white/35 transition-colors"
              placeholder={copy.passwordPlaceholder}
              minLength={8}
            />
            <div className="mt-2 text-right">
              <button type="button" className="text-white/80 hover:text-white text-sm underline underline-offset-2">
                {copy.forgotPassword}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 rounded-md bg-primary hover:bg-primary/90 text-white font-semibold text-base transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {copy.loggingIn}</> : <><LogIn className="w-4 h-4" /> {copy.login}</>}
          </button>

          <div className="flex items-center gap-3 py-1">
            <div className="h-px bg-white/20 flex-1" />
            <span className="text-white/60 text-sm">{copy.or}</span>
            <div className="h-px bg-white/20 flex-1" />
          </div>

          <button
            type="button"
            disabled
            title={copy.comingSoon}
            className="w-full h-12 rounded-md border border-white/20 bg-transparent text-white/85 text-lg font-medium flex items-center justify-center gap-3 cursor-not-allowed"
          >
            <span className="text-xl">G</span> {copy.loginWithGoogle}
          </button>
        </form>

        <p className="text-center text-sm text-white/60 mt-8">
          {copy.noAccount}{" "}
          <Link to="/register" state={{ from: redirectTo }} className="text-purple-400 hover:text-purple-300 font-semibold transition-colors">
            {copy.registerNow}
          </Link>
        </p>
      </div>
    </div>
  );
}
