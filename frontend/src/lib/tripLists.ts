/**
 * User-defined trip / collection lists (events + legal stays).
 * MVP: localStorage + window event (mirror favorites pattern).
 */

import type { Exhibition } from "@/data/mock";
import type { AgentRecommendationItem, LegalStay } from "@/lib/api";

const STORAGE_KEY = "exhibeat_trip_lists";
const LEGACY_RECOMMENDATION_LISTS_KEY = "exhibeat_recommendation_lists";
const CHANGE_EVENT = "trip-lists-changed";
const AGENT_PREFILL_KEY = "exhibeat_agent_prefill";
const DEFAULT_TRIP_LIST_ID = "default_favorites_list";
const DEFAULT_TRIP_LIST_NAME = "我的最愛";

export type TripListEventItem = { kind: "event"; payload: Exhibition };
export type TripListStayItem = { kind: "stay"; payload: LegalStay };
export type TripListItem = TripListEventItem | TripListStayItem;

export type TripList = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: TripListItem[];
};

export type AgentPrefillEnvelope = {
  source: "trip_list";
  nonce: string;
  createdAt: string;
  listId: string;
  listName: string;
  text: string;
};

function dispatchChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function readRaw(): TripList[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLists(lists: TripList[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  dispatchChange();
}

function createDefaultTripList(): TripList {
  const now = new Date().toISOString();
  return {
    id: DEFAULT_TRIP_LIST_ID,
    name: DEFAULT_TRIP_LIST_NAME,
    createdAt: now,
    updatedAt: now,
    items: [],
  };
}

function ensureDefaultTripList(lists: TripList[]): TripList[] {
  const hasDefault = lists.some((list) => list.id === DEFAULT_TRIP_LIST_ID);
  if (hasDefault) return lists;
  return [createDefaultTripList(), ...lists];
}

export function agentRecommendationToExhibition(item: AgentRecommendationItem): Exhibition {
  return {
    id: item.id,
    title: item.title,
    dateStr: item.dateStr,
    location: item.location,
    imageUrl: item.imageUrl || "",
    tags: [],
    isFavorite: false,
  };
}

export function agentRecommendationToStay(item: AgentRecommendationItem): LegalStay {
  if (item.stayData) return item.stayData;
  const now = new Date().toISOString();
  const lat = typeof item.stayLat === "number" ? item.stayLat : 25.033;
  const lng = typeof item.stayLng === "number" ? item.stayLng : 121.5654;
  const address = item.stayAddress || item.location || "台北市";
  return {
    id: item.id,
    licenseNumber: "",
    name: item.title,
    alternateNames: [],
    description: item.reason || "",
    operatorName: "",
    address: {
      city: "台北市",
      cityCode: "",
      town: "",
      townCode: "",
      zipCode: "",
      street: "",
      full: address,
    },
    location: { lat, lng },
    classCodes: [],
    classLabels: ["合法旅宿"],
    starRating: 0,
    taiwanHost: 0,
    serviceStatus: 1,
    serviceStatusLabel: "營業中",
    phones: [],
    urls: { website: "", reservation: [], map: [], sameAs: [], socialMedia: [] },
    images: [],
    primaryImageUrl: item.imageUrl || "",
    mediaDetailUrl: "",
    imageSourcePolicy: { source: "agent", license: "", attribution: "" },
    facilities: [],
    paymentMethods: [],
    parkingInfo: "",
    roomInfo: "",
    serviceInfo: "",
    totalRooms: 0,
    totalCapacity: 0,
    priceRange: { lowest: 0, ceiling: 0 },
    accessibility: { accessibleRooms: 0, toilets: 0, liftingEquipments: 0, parkingSpaces: 0 },
    remarks: "",
    updateTime: now,
    source: "agent-carousel",
    searchText: `${item.title} ${address}`,
  };
}

function migrateLegacyRecommendationLists(): TripList[] {
  const existing = readRaw();
  if (existing.length > 0) return existing;
  try {
    const raw = localStorage.getItem(LEGACY_RECOMMENDATION_LISTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const migrated: TripList[] = parsed.map((row: any) => {
      const events = Array.isArray(row.events) ? row.events : [];
      const items: TripListItem[] = events
        .filter((e: any) => e?.id && e?.title)
        .map((e: AgentRecommendationItem) => ({
          kind: "event" as const,
          payload: agentRecommendationToExhibition(e),
        }));
      return {
        id: String(row.id ?? `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
        name: String(row.name ?? "AI 推薦清單"),
        createdAt: String(row.createdAt ?? new Date().toISOString()),
        updatedAt: String(row.createdAt ?? new Date().toISOString()),
        items,
      };
    });
    if (migrated.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_RECOMMENDATION_LISTS_KEY);
      dispatchChange();
    }
    return migrated;
  } catch {
    return [];
  }
}

export function getTripLists(): TripList[] {
  let lists = readRaw();
  if (lists.length === 0) lists = migrateLegacyRecommendationLists();
  return ensureDefaultTripList(lists);
}

export function getTripListById(id: string): TripList | undefined {
  return getTripLists().find((l) => l.id === id);
}

export function itemKey(item: TripListItem): string {
  if (item.kind === "event") return `event:${item.payload.id}`;
  return `stay:${item.payload.id}`;
}

export function createTripList(name: string): TripList {
  const trimmed = name.trim();
  const finalName = trimmed || `行程清單 ${new Date().toLocaleDateString("zh-TW")}`;
  const now = new Date().toISOString();
  const list: TripList = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    name: finalName,
    createdAt: now,
    updatedAt: now,
    items: [],
  };
  const prev = getTripLists();
  writeLists([list, ...prev]);
  return list;
}

export function createTripListWithFirstItem(name: string, item: TripListItem): TripList {
  const list = createTripList(name);
  addItemToTripList(list.id, item);
  return getTripListById(list.id)!;
}

export function renameTripList(listId: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const now = new Date().toISOString();
  const lists = getTripLists().map((l) =>
    l.id === listId ? { ...l, name: trimmed, updatedAt: now } : l,
  );
  writeLists(lists);
}

export function deleteTripList(listId: string): void {
  if (listId === DEFAULT_TRIP_LIST_ID) return;
  writeLists(getTripLists().filter((l) => l.id !== listId));
}

function upsertList(listId: string, updater: (list: TripList) => TripList): void {
  const now = new Date().toISOString();
  const lists = getTripLists().map((l) => {
    if (l.id !== listId) return l;
    return { ...updater(l), updatedAt: now };
  });
  writeLists(lists);
}

export function addItemToTripList(listId: string, item: TripListItem): void {
  const key = itemKey(item);
  upsertList(listId, (list) => {
    if (list.items.some((i) => itemKey(i) === key)) return list;
    return { ...list, items: [...list.items, item] };
  });
}

export function removeItemFromTripList(listId: string, item: TripListItem): void {
  const key = itemKey(item);
  upsertList(listId, (list) => ({
    ...list,
    items: list.items.filter((i) => itemKey(i) !== key),
  }));
}

export function removeItemKeyFromTripList(listId: string, key: string): void {
  upsertList(listId, (list) => ({
    ...list,
    items: list.items.filter((i) => itemKey(i) !== key),
  }));
}

export function addEventToTripList(listId: string, exhibition: Exhibition): void {
  addItemToTripList(listId, { kind: "event", payload: { ...exhibition, isFavorite: exhibition.isFavorite } });
}

export function addStayToTripList(listId: string, stay: LegalStay): void {
  addItemToTripList(listId, { kind: "stay", payload: stay });
}

export function syncFavoriteEventInDefaultList(exhibition: Exhibition, shouldInclude: boolean): void {
  const lists = getTripLists();
  const defaultList = lists.find((list) => list.id === DEFAULT_TRIP_LIST_ID);
  if (!defaultList) return;
  const favoriteItem: TripListItem = { kind: "event", payload: { ...exhibition, isFavorite: shouldInclude } };
  if (shouldInclude) {
    addItemToTripList(defaultList.id, favoriteItem);
  } else {
    removeItemFromTripList(defaultList.id, favoriteItem);
  }
}

export function createTripListWithItem(name: string, item: TripListItem): TripList {
  const list = createTripList(name);
  addItemToTripList(list.id, item);
  return getTripListById(list.id)!;
}

/** First up to 4 event image URLs for mosaic header; placeholders for stays-only lists. */
export function getListMosaicImageUrls(list: TripList): string[] {
  const PLACEHOLDER =
    "https://images.unsplash.com/photo-1549490349-8643362247b5?w=300&auto=format&fit=crop&q=60";
  const urls: string[] = [];
  for (const item of list.items) {
    if (item.kind === "event" && item.payload.imageUrl) {
      urls.push(item.payload.imageUrl);
      if (urls.length >= 4) break;
    }
  }
  while (urls.length < 4) urls.push(PLACEHOLDER);
  return urls.slice(0, 4);
}

export function buildListSummaryForAgent(list: TripList): string {
  const lines: string[] = [
    `請根據以下「${list.name}」行程清單協助我規劃行程（交通、時間安排、注意事項皆可）：`,
    "",
  ];
  list.items.forEach((item, idx) => {
    if (item.kind === "event") {
      const e = item.payload;
      lines.push(`${idx + 1}. [展演] ${e.title}`);
      lines.push(`   地點：${e.location}`);
      lines.push(`   檔期：${e.dateStr}`);
      const lat = e._meta?.latitude;
      const lng = e._meta?.longitude;
      if (typeof lat === "number" && typeof lng === "number") {
        lines.push(`   座標：${lat}, ${lng}`);
      }
    } else {
      const s = item.payload;
      lines.push(`${idx + 1}. [旅宿] ${s.name}`);
      lines.push(`   地址：${s.address.full}`);
      lines.push(`   座標：${s.location.lat}, ${s.location.lng}`);
    }
    lines.push("");
  });
  return lines.join("\n").trim();
}

export function queueAgentPrefillFromList(list: TripList): void {
  const text = buildListSummaryForAgent(list);
  const envelope: AgentPrefillEnvelope = {
    source: "trip_list",
    nonce: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    listId: list.id,
    listName: list.name,
    text,
  };
  sessionStorage.setItem(AGENT_PREFILL_KEY, JSON.stringify(envelope));
}

export const TRIP_LISTS_CHANGE_EVENT = CHANGE_EVENT;
export const AGENT_PREFILL_STORAGE_KEY = AGENT_PREFILL_KEY;
export const DEFAULT_TRIP_LIST_ID_KEY = DEFAULT_TRIP_LIST_ID;
