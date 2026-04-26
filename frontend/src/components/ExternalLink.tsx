import { useState, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { ExternalNavigationModal } from "@/components/ExternalNavigationModal";
import { getLocaleCopy, useLanguage } from "@/lib/language";

type ExternalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  confirmMessage?: string;
};

export function ExternalLink({
  confirmMessage,
  onClick,
  href,
  target,
  ...rest
}: ExternalLinkProps) {
  const { locale } = useLanguage();
  const copy = getLocaleCopy(locale, {
    "zh-TW": {
      defaultConfirm: "你即將離開 ExhiBeat 並前往外部網站，是否繼續？",
    },
    en: {
      defaultConfirm: "You are about to leave ExhiBeat and open an external website. Continue?",
    },
    fr: {
      defaultConfirm: "Êtes-vous sûr de vouloir ouvrir un lien externe ?",
    },
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const resolvedConfirmMessage = confirmMessage ?? copy.defaultConfirm;

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    e.preventDefault();
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    if (!href) return;
    if (target === "_blank") {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.href = href;
  };

  return (
    <>
      <a {...rest} href={href} target={target} onClick={handleClick} />
      <ExternalNavigationModal
        open={confirmOpen}
        description={resolvedConfirmMessage}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
