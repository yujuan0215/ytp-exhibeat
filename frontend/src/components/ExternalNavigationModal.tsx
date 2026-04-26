import { getLocaleCopy, useLanguage } from "@/lib/language";

type ExternalNavigationModalProps = {
  open: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ExternalNavigationModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ExternalNavigationModalProps) {
  const { locale } = useLanguage();
  const copy = getLocaleCopy(locale, {
    "zh-TW": {
      title: "即將前往外部網站",
      description: "你即將離開 ExhiBeat 並前往外部網站，是否繼續？",
      confirm: "繼續前往",
      cancel: "留在本站",
    },
    en: {
      title: "Leaving to external website",
      description: "You are about to leave ExhiBeat and open an external website. Continue?",
      confirm: "Continue",
      cancel: "Stay here",
    },
    fr: {
      title: "Ouverture d'un site externe",
      description: "Vous allez quitter ExhiBeat et ouvrir un site externe. Continuer ?",
      confirm: "Confirmer",
      cancel: "Annuler",
    },
  });
  const resolvedTitle = title ?? copy.title;
  const resolvedDescription = description ?? copy.description;
  const resolvedConfirmLabel = confirmLabel ?? copy.confirm;
  const resolvedCancelLabel = cancelLabel ?? copy.cancel;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#181622] p-5 shadow-2xl">
        <h3 className="text-lg font-bold text-white">{resolvedTitle}</h3>
        <p className="mt-2 text-sm leading-relaxed text-white/70">{resolvedDescription}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:text-white hover:border-white/30 transition-colors"
          >
            {resolvedCancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-[#774AD9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6a41c0] transition-colors"
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
