import type { AgentItineraryStop } from "@/lib/api";

const STORAGE_KEY = "exhibeat_saved_itineraries";
const CHANGE_EVENT = "saved-itineraries-changed";

export type SavedItinerary = {
  id: string;
  createdAt: string;
  name: string;
  title?: string;
  introText?: string;
  date?: string;
  stops: AgentItineraryStop[];
};

function dispatchChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function readRaw(): SavedItinerary[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(rows: SavedItinerary[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  dispatchChange();
}

export function getSavedItineraries(): SavedItinerary[] {
  return readRaw().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function saveChatItinerary(payload: {
  name?: string;
  title?: string;
  introText?: string;
  date?: string;
  stops: AgentItineraryStop[];
}): SavedItinerary {
  const finalName = (payload.name || payload.title || "我的行程").trim() || "我的行程";
  const saved: SavedItinerary = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    name: finalName,
    title: payload.title,
    introText: payload.introText,
    date: payload.date,
    // Store exactly the chat-outputted card structure.
    stops: payload.stops,
  };
  const prev = readRaw();
  writeRaw([saved, ...prev]);
  return saved;
}

export const SAVED_ITINERARIES_CHANGE_EVENT = CHANGE_EVENT;
