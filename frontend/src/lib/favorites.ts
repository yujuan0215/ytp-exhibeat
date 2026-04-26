/**
 * Unified favorites store.
 *
 * - When signed out: persist to localStorage only ("exhibeat_favorites")
 * - When signed in:  persist to backend via /api/favorites, and mirror to
 *                    localStorage as a cheap cache for instant rendering.
 *
 * Components observe changes via the `favorites-changed` window event.
 */

import type { Exhibition } from "@/data/mock";
import {
  addRemoteFavorite,
  deleteRemoteFavorite,
  getAuthToken,
  listRemoteFavorites,
} from "./api";
import { syncFavoriteEventInDefaultList } from "./tripLists";

const STORAGE_KEY = "exhibeat_favorites";
const CHANGE_EVENT = "favorites-changed";

function readCache(): Exhibition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCache(list: Exhibition[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getFavorites(): Exhibition[] {
  return readCache();
}

export function isFavorited(id: string): boolean {
  return readCache().some((e) => e.id === id);
}

export async function refreshFavoritesCache(authenticated: boolean) {
  if (!authenticated || !getAuthToken()) {
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return;
  }
  try {
    const remote = await listRemoteFavorites();
    const list: Exhibition[] = remote.map((r) => {
      const payload = (r.payload ?? {}) as Partial<Exhibition>;
      return {
        id: r.exhibition_id,
        title: payload.title ?? "(未命名展覽)",
        dateStr: payload.dateStr ?? "",
        location: payload.location ?? "",
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        imageUrl: payload.imageUrl ?? "",
        aiSummary: payload.aiSummary,
        fullDescription: payload.fullDescription,
        price: payload.price,
        isFavorite: true,
        _meta: payload._meta,
      } as Exhibition;
    });
    writeCache(list);
  } catch (err) {
    console.warn("Failed to sync remote favorites", err);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

export async function toggleFavorite(exhibition: Exhibition): Promise<boolean> {
  const authenticated = Boolean(getAuthToken());
  const currently = isFavorited(exhibition.id);

  if (currently) {
    const next = readCache().filter((e) => e.id !== exhibition.id);
    writeCache(next);
    syncFavoriteEventInDefaultList(exhibition, false);
    if (authenticated) {
      try {
        await deleteRemoteFavorite(exhibition.id);
      } catch (err) {
        console.warn("Failed to remove remote favorite", err);
      }
    }
    return false;
  }

  const nextItem: Exhibition = { ...exhibition, isFavorite: true };
  const next = [...readCache().filter((e) => e.id !== exhibition.id), nextItem];
  writeCache(next);
  syncFavoriteEventInDefaultList(nextItem, true);
  if (authenticated) {
    try {
      await addRemoteFavorite(nextItem);
    } catch (err) {
      console.warn("Failed to persist remote favorite", err);
    }
  }
  return true;
}
