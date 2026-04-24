import { Link } from "react-router-dom";

type InfoPageProps = {
  title: string;
  body: string;
};

export function InfoPage({ title, body }: InfoPageProps) {
  return (
    <section className="mx-auto max-w-3xl px-8 py-14">
      <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-6">{title}</h1>
      <p className="text-white/75 leading-8 whitespace-pre-line">{body}</p>
      <div className="mt-10">
        <Link
          to="/"
          className="inline-flex items-center rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/80 hover:text-white hover:border-white/30 transition-colors"
        >
          返回首頁
        </Link>
      </div>
    </section>
  );
}
