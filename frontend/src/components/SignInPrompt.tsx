import { Link } from "react-router-dom";
import { Lock, X } from "lucide-react";
import { getLocaleCopy, useLanguage } from "@/lib/language";

interface SignInPromptProps {
  open: boolean;
  from: string;
  title?: string;
  description?: string;
  onClose: () => void;
}

export function SignInPrompt({
  open,
  from,
  title,
  description,
  onClose,
}: SignInPromptProps) {
  const { locale } = useLanguage();
  const copy = getLocaleCopy(locale, {
    "zh-TW": {
      title: "收藏活動需要先登入",
      description: "登入後即可同步你的收藏，換裝置也不會遺失。",
      close: "Close",
      later: "稍後再說",
      loginNow: "立即登入",
    },
    en: {
      title: "Sign in to save activities",
      description: "Sign in to sync your saved items so they won't be lost across devices.",
      close: "Close",
      later: "Maybe later",
      loginNow: "Sign in now",
    },
    fr: {
      title: "Connectez-vous pour enregistrer des activités",
      description: "Connectez-vous pour synchroniser vos éléments enregistrés et les retrouver sur tous vos appareils.",
      close: "Fermer",
      later: "Plus tard",
      loginNow: "Se connecter",
    },
  });
  const resolvedTitle = title ?? copy.title;
  const resolvedDescription = description ?? copy.description;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="sign-in-required"
        className="w-full max-w-md border border-[#df8eff]/40 bg-[#111827] p-5 text-white shadow-2xl rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-[#df8eff]/15 p-2 text-[#df8eff]">
              <Lock className="h-4 w-4" />
            </div>
            <p className="text-lg font-bold text-[#f3e8ff]">{resolvedTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={copy.close}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-white/75">{resolvedDescription}</p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            {copy.later}
          </button>
          <Link
            to="/login"
            state={{ from }}
            className="rounded-full bg-[#df8eff] px-4 py-2 text-sm font-bold text-[#2f0f42] transition-colors hover:bg-[#d680f6]"
            onClick={onClose}
          >
            {copy.loginNow}
          </Link>
        </div>
      </div>
    </div>
  );
}
