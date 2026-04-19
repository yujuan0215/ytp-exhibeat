/**
 * Favorites store backed by localStorage.
 * Key: "exhibeat_favorites" → JSON array of Exhibition objects.
 */

import type { Exhibition } from "@/data/mock";

const STORAGE_KEY = "exhibeat_favorites";

export function getFavorites(): Exhibition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function isFavorited(id: string): boolean {
  return getFavorites().some(e => e.id === id);
}

export function addFavorite(exhibition: Exhibition): void {
  const favorites = getFavorites().filter(e => e.id !== exhibition.id);
  favorites.push({ ...exhibition, isFavorite: true });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  window.dispatchEvent(new Event("favorites-changed"));
}

export function removeFavorite(id: string): void {
  const favorites = getFavorites().filter(e => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  window.dispatchEvent(new Event("favorites-changed"));
}

export function toggleFavorite(exhibition: Exhibition): boolean {
  if (isFavorited(exhibition.id)) {
    removeFavorite(exhibition.id);
    return false;
  } else {
    addFavorite(exhibition);
    return true;
  }
}
