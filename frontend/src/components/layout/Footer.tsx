import { Link } from "react-router-dom";
import { ExternalLink } from "@/components/ExternalLink";
import { getLocaleCopy, useLanguage } from "@/lib/language";

export function Footer() {
  const { locale } = useLanguage();
  const copy = getLocaleCopy(locale, {
    "zh-TW": {
      about: "關於我們",
      terms: "服務條款",
      privacy: "隱私政策",
      contact: "聯絡我們",
      slogan: "展動台北",
    },
    en: {
      about: "About",
      terms: "Terms",
      privacy: "Privacy",
      contact: "Nous contacter",
      slogan: "Exhibitions in Taipei",
    },
    fr: {
      about: "À propos",
      terms: "Conditions",
      privacy: "Confidentialité",
      contact: "Contact",
      slogan: "Explorez les expositions et trouvez votre prochain itinéraire culturel.",
    },
  });

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
          <Link to="/about" className="text-foreground/40 hover:text-primary transition-colors">{copy.about}</Link>
          <Link to="/terms" className="text-foreground/40 hover:text-primary transition-colors">{copy.terms}</Link>
          <Link to="/privacy" className="text-foreground/40 hover:text-primary transition-colors">{copy.privacy}</Link>
          <Link to="/contact" className="text-foreground/40 hover:text-primary transition-colors">{copy.contact}</Link>
        </div>
      </div>
      <p className="mb-4 text-foreground/40">
        © 2026{" "}
        <span style={{ color: "#df8eff", fontFamily: '"The Seasons", serif', fontWeight: 400 }}>
          ExhiBeat
        </span>
        . {copy.slogan}.
      </p>
      <div className="flex justify-center gap-4">
        <ExternalLink href="https://www.google.com" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">🌐</ExternalLink>
        <ExternalLink href="mailto:hello@exhibeat.local" className="hover:text-primary transition-colors">✉️</ExternalLink>
      </div>
    </footer>
  );
}
