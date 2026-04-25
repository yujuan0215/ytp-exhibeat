import { useCallback, useEffect, useMemo, useState } from "react";
import { translateDynamicTexts } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const localCache = new Map<string, string>();
const TRANSLATION_BATCH_SIZE = 40;

function cacheKey(locale: string, text: string) {
  return `${locale}:${text}`;
}

function normalizeText(text: string) {
  return String(text).split(/\s+/).filter(Boolean).join(" ").trim();
}

function containsCjk(text: string) {
  return /[\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
}

function isStalePassthrough(locale: string, source: string, translated: string) {
  return locale !== "zh-TW" && translated === source && containsCjk(source);
}

export function useDynamicTranslation(texts: string[], context = "") {
  const { locale } = useI18n();
  const textKey = texts.map(normalizeText).join("\u0001");
  const stableTexts = useMemo(
    () => Array.from(new Set(texts.map(normalizeText).filter(Boolean))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [textKey],
  );
  const [translations, setTranslations] = useState<Record<string, string>>({});

  useEffect(() => {
    if (locale === "zh-TW" || stableTexts.length === 0) {
      setTranslations(Object.fromEntries(stableTexts.map((text) => [text, text])));
      return;
    }

    const cached: Record<string, string> = {};
    const missing: string[] = [];
    stableTexts.forEach((text) => {
      const value = localCache.get(cacheKey(locale, text));
      if (!value) {
        missing.push(text);
        return;
      }
      if (isStalePassthrough(locale, text, value)) {
        localCache.delete(cacheKey(locale, text));
        missing.push(text);
        return;
      }
      cached[text] = value;
    });

    setTranslations(cached);
    if (!missing.length) return;

    let cancelled = false;
    const batches = Array.from(
      { length: Math.ceil(missing.length / TRANSLATION_BATCH_SIZE) },
      (_, index) => missing.slice(index * TRANSLATION_BATCH_SIZE, (index + 1) * TRANSLATION_BATCH_SIZE),
    );

    Promise.all(batches.map((batch) => translateDynamicTexts({ texts: batch, targetLocale: locale, context })))
      .then((responses) => {
        if (cancelled) return;
        const merged = responses.reduce<Record<string, string>>(
          (acc, response) => ({ ...acc, ...response.translations }),
          {},
        );
        Object.entries(merged).forEach(([source, translated]) => {
          if (!isStalePassthrough(locale, source, translated)) {
            localCache.set(cacheKey(locale, source), translated);
          }
        });
        setTranslations((prev) => ({ ...prev, ...merged }));
      })
      .catch(() => {
        if (!cancelled) {
          setTranslations((prev) => ({ ...prev, ...Object.fromEntries(missing.map((text) => [text, text])) }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [context, locale, stableTexts]);

  return useCallback((text: string) => {
    const normalized = normalizeText(text);
    return translations[normalized] ?? text;
  }, [translations]);
}
