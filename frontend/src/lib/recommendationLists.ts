import type { AgentRecommendationItem } from "./api";

const STORAGE_KEY = "exhibeat_recommendation_lists";

export type RecommendationList = {
  id: string;
  name: string;
  createdAt: string;
  eventIds: string[];
  events: AgentRecommendationItem[];
};

function readLists(): RecommendationList[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLists(lists: RecommendationList[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

export function saveRecommendationList(name: string, events: AgentRecommendationItem[]): RecommendationList {
  const trimmed = name.trim();
  const finalName = trimmed || `推薦清單 ${new Date().toLocaleDateString()}`;
  const list: RecommendationList = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: finalName,
    createdAt: new Date().toISOString(),
    eventIds: events.map((event) => event.id),
    events,
  };
  const prev = readLists();
  writeLists([list, ...prev]);
  return list;
}

export function getRecommendationLists(): RecommendationList[] {
  return readLists();
}
