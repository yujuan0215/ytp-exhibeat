import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getLocaleCopy, useLanguage } from "@/lib/language";

export function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, user, status } = useAuth();
  const { locale } = useLanguage();
  const copy = getLocaleCopy(locale, {
    "zh-TW": {
      emptyName: "使用者名稱不可空白",
      nameTooLong: "使用者名稱不可超過 128 字元",
      registerFailed: "註冊失敗",
      checkingAuth: "驗證登入狀態中…",
      title: "建立你的帳號",
      displayName: "顯示名稱",
      displayNamePlaceholder: "顯示在個人頁的名稱",
      email: "Email",
      emailPlaceholder: "您的 Email",
      password: "密碼",
      passwordPlaceholder: "至少 8 個字元",
      creatingAccount: "建立帳號中…",
      createAccount: "建立帳號",
      alreadyHaveAccount: "已經有帳號了？",
      loginNow: "直接登入",
    },
    en: {
      emptyName: "Display name cannot be empty",
      nameTooLong: "Display name must be 128 characters or fewer",
      registerFailed: "Registration failed",
      checkingAuth: "Checking authentication…",
      title: "Create your account",
      displayName: "Display name",
      displayNamePlaceholder: "Name shown on your profile",
      email: "Email",
      emailPlaceholder: "Your email",
      password: "Password",
      passwordPlaceholder: "At least 8 characters",
      creatingAccount: "Creating account…",
      createAccount: "Create account",
      alreadyHaveAccount: "Already have an account?",
      loginNow: "Sign in",
    },
    fr: {
      emptyName: "Le nom d'affichage ne peut pas être vide",
      nameTooLong: "Le nom d'affichage doit contenir au maximum 128 caractères",
      registerFailed: "Échec de l'inscription",
      checkingAuth: "Vérification de l'authentification…",
      title: "Créez votre compte",
      displayName: "Nom d'affichage",
      displayNamePlaceholder: "Nom affiché sur votre profil",
      email: "E-mail",
      emailPlaceholder: "Votre e-mail",
      password: "Mot de passe",
      passwordPlaceholder: "Au moins 8 caractères",
      creatingAccount: "Création du compte…",
      createAccount: "Créer un compte",
      alreadyHaveAccount: "Vous avez déjà un compte ?",
      loginNow: "Se connecter",
    },
  });

  const requestedRedirect = (location.state as { from?: string } | null)?.from ?? "/";
  const redirectTo = requestedRedirect === "/login" || requestedRedirect === "/register" ? "/" : requestedRedirect;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedDisplayName = displayName.trim();
    if (!trimmedDisplayName) {
      setError(copy.emptyName);
      return;
    }
    if (trimmedDisplayName.length > 128) {
      setError(copy.nameTooLong);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await register({
        email: email.trim(),
        password,
        display_name: trimmedDisplayName,
      });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.registerFailed);
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
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-extrabold text-white tracking-wide">{copy.title}</h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-sm font-semibold text-white/90 mb-2 block">{copy.displayName}</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={128}
                className="w-full h-12 rounded-md bg-transparent border border-white/20 focus:border-primary focus:ring-1 focus:ring-primary/40 outline-none px-4 text-lg text-white placeholder:text-white/35 transition-colors"
                placeholder={copy.displayNamePlaceholder}
              />
            </div>
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
          </div>

          <div>
            <label className="text-sm font-semibold text-white/90 mb-2 block">{copy.password}</label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 rounded-md bg-transparent border border-white/20 focus:border-primary focus:ring-1 focus:ring-primary/40 outline-none px-4 text-lg text-white placeholder:text-white/35 transition-colors"
              placeholder={copy.passwordPlaceholder}
            />
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
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {copy.creatingAccount}</> : <><UserPlus className="w-4 h-4" /> {copy.createAccount}</>}
          </button>
        </form>

        <p className="text-center text-sm text-white/60 mt-8">
          {copy.alreadyHaveAccount}{" "}
          <Link to="/login" state={{ from: redirectTo }} className="text-purple-400 hover:text-purple-300 font-semibold transition-colors">
            {copy.loginNow}
          </Link>
        </p>
      </div>
    </div>
  );
}
