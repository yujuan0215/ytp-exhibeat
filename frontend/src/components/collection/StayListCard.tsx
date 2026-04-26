import { MapPin, ExternalLink } from "lucide-react";
import type { LegalStay } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { getLocaleCopy, useLanguage } from "@/lib/language";
import { AddToTripListMenu } from "./AddToTripListMenu";

type Props = {
  stay: LegalStay;
  currentListId?: string | null;
};

export function StayListCard({ stay, currentListId }: Props) {
  const { theme } = useTheme();
  const isV1 = theme === "v1";
  const { locale } = useLanguage();
  const copy = getLocaleCopy(locale, {
    "zh-TW": { stay: "旅宿", mapLink: "地圖 / 詳情連結" },
    en: { stay: "Stay", mapLink: "Map / Details" },
    fr: { stay: "Hébergement", mapLink: "Carte / Détails" },
  });
  const mapHref =
    stay.urls.map[0] ||
    `https://www.google.com/maps/search/?api=1&query=${stay.location.lat},${stay.location.lng}`;

  return (
    <div
      className={`relative border border-white/10 bg-surface-container-low ${isV1 ? "rounded-md" : "rounded-2xl"} overflow-hidden`}
    >
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300/90">{copy.stay}</p>
            <h3 className="mt-0.5 line-clamp-2 text-base font-bold text-white">{stay.name}</h3>
          </div>
          <AddToTripListMenu kind="stay" stay={stay} currentListId={currentListId} align="end" />
        </div>
        <p className="line-clamp-2 flex items-start gap-1.5 text-xs text-white/65">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-200/80" />
          {stay.address.full}
        </p>
        <a
          href={mapHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-200 hover:text-cyan-100"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {copy.mapLink}
        </a>
      </div>
    </div>
  );
}
