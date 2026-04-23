import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, user, status } = useAuth();

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
      setError(err instanceof Error ? err.message : "登入失敗");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-[80vh] flex items-center justify-center text-white/60 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> 驗證登入狀態中…
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
          <h1 className="text-5xl font-extrabold text-white tracking-wide">登入</h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="text-sm font-semibold text-white/90 mb-2 block">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 rounded-md bg-transparent border border-white/20 focus:border-primary focus:ring-1 focus:ring-primary/40 outline-none px-4 text-lg text-white placeholder:text-white/35 transition-colors"
              placeholder="您的 Email"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-white/90 mb-2 block">密碼</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 rounded-md bg-transparent border border-white/20 focus:border-primary focus:ring-1 focus:ring-primary/40 outline-none px-4 text-lg text-white placeholder:text-white/35 transition-colors"
              placeholder="您的密碼"
              minLength={8}
            />
            <div className="mt-2 text-right">
              <button type="button" className="text-white/80 hover:text-white text-sm underline underline-offset-2">
                忘記密碼
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
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> 登入中…</> : <><LogIn className="w-4 h-4" /> 登入</>}
          </button>

          <div className="flex items-center gap-3 py-1">
            <div className="h-px bg-white/20 flex-1" />
            <span className="text-white/60 text-sm">或是</span>
            <div className="h-px bg-white/20 flex-1" />
          </div>

          <button
            type="button"
            disabled
            title="即將推出"
            className="w-full h-12 rounded-md border border-white/20 bg-transparent text-white/85 text-lg font-medium flex items-center justify-center gap-3 cursor-not-allowed"
          >
            <span className="text-xl">G</span> 透過 Google 登入
          </button>
        </form>

        <p className="text-center text-sm text-white/60 mt-8">
          還沒有帳號？{" "}
          <Link to="/register" state={{ from: redirectTo }} className="text-purple-400 hover:text-purple-300 font-semibold transition-colors">
            立即註冊
          </Link>
        </p>
      </div>
    </div>
  );
}
