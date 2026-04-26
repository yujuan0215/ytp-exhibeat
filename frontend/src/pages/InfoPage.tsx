import { Link } from "react-router-dom";
import { getLocaleCopy, useLanguage } from "@/lib/language";

type InfoPageProps = {
  title: string;
  body: string;
};

export function InfoPage({ title, body }: InfoPageProps) {
  const { locale } = useLanguage();
  const copy = getLocaleCopy(locale, {
    "zh-TW": { backHome: "返回首頁" },
    en: { backHome: "Back to home" },
    fr: { backHome: "Retour à l'accueil" },
  });

  return (
    <section className="mx-auto max-w-3xl px-8 py-14">
      <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-6">{title}</h1>
      <p className="text-white/75 leading-8 whitespace-pre-line">{body}</p>
      <div className="mt-10">
        <Link
          to="/"
          className="inline-flex items-center rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/80 hover:text-white hover:border-white/30 transition-colors"
        >
          {copy.backHome}
        </Link>
      </div>
    </section>
  );
}
