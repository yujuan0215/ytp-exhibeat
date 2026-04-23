import { Link } from "react-router-dom";
import { Lock, X } from "lucide-react";

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
  title = "收藏活動需要先登入",
  description = "登入後即可同步你的收藏，換裝置也不會遺失。",
  onClose,
}: SignInPromptProps) {
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
            <p className="text-lg font-bold text-[#f3e8ff]">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-white/75">{description}</p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            稍後再說
          </button>
          <Link
            to="/login"
            state={{ from }}
            className="rounded-full bg-[#df8eff] px-4 py-2 text-sm font-bold text-[#2f0f42] transition-colors hover:bg-[#d680f6]"
            onClick={onClose}
          >
            立即登入
          </Link>
        </div>
      </div>
    </div>
  );
}
