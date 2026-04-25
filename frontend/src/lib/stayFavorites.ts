const STORAGE_KEY = "exhibeat_stay_favorites";
export const STAY_FAVORITES_CHANGE_EVENT = "stay-favorites-changed";

function readCache(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeCache(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event(STAY_FAVORITES_CHANGE_EVENT));
}

export function getStayFavoriteIds(): string[] {
  return readCache();
}

export function isStayFavorited(stayId: string): boolean {
  return readCache().includes(stayId);
}

export function toggleStayFavorite(stayId: string): boolean {
  const current = readCache();
  if (current.includes(stayId)) {
    writeCache(current.filter((id) => id !== stayId));
    return false;
  }
  writeCache([...current, stayId]);
  return true;
}
