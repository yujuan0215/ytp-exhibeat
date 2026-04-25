import { useCallback } from "react";

export function useDynamicTranslation(texts: string[], context = "") {
  void texts;
  void context;
  return useCallback((text: string) => text, []);
}
