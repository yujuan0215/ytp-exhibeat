import { Link } from "react-router-dom";
import { ExternalLink } from "@/components/ExternalLink";

export function Footer() {
  return (
    <footer className="w-full py-12 mt-12 text-center text-sm text-muted-foreground border-t border-[#48474d]/20 bg-background">
      <div className="flex flex-col justify-center items-center gap-6 mb-4">
        <span
          className="text-3xl tracking-tight"
          style={{ color: "#df8eff", fontFamily: '"The Seasons", serif', fontWeight: 400 }}
        >
          ExhiBeat
        </span>
        <div className="flex gap-6">
          <Link to="/about" className="text-foreground/40 hover:text-primary transition-colors">關於我們</Link>
          <Link to="/terms" className="text-foreground/40 hover:text-primary transition-colors">服務條款</Link>
          <Link to="/privacy" className="text-foreground/40 hover:text-primary transition-colors">隱私政策</Link>
          <Link to="/contact" className="text-foreground/40 hover:text-primary transition-colors">聯絡我們</Link>
        </div>
      </div>
      <p className="mb-4 text-foreground/40">
        © 2024{" "}
        <span style={{ color: "#df8eff", fontFamily: '"The Seasons", serif', fontWeight: 400 }}>
          ExhiBeat
        </span>
        . 展動台北.
      </p>
      <div className="flex justify-center gap-4">
        <ExternalLink href="https://www.google.com" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">🌐</ExternalLink>
        <ExternalLink href="mailto:hello@exhibeat.local" className="hover:text-primary transition-colors">✉️</ExternalLink>
      </div>
    </footer>
  );
}
