import { useState, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { ExternalNavigationModal } from "@/components/ExternalNavigationModal";

type ExternalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  confirmMessage?: string;
};

const DEFAULT_CONFIRM_MESSAGE = "你即將離開 ExhiBeat 並前往外部網站，是否繼續？";

export function ExternalLink({
  confirmMessage = DEFAULT_CONFIRM_MESSAGE,
  onClick,
  href,
  target,
  ...rest
}: ExternalLinkProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

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
        description={confirmMessage}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
