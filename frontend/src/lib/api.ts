/**
 * Core API service for communicating with the ExhiBeat backend.
 */

import type { Exhibition } from "@/data/mock";

const APP_NAME = "gemini_agent";
const USER_ID = "local-dev-user";
const TOKEN_STORAGE_KEY = "exhibeat_token";

export type AgentRecommendationItem = {
  id: string;
  title: string;
  dateStr: string;
  location: string;
  imageUrl: string;
  reason?: string;
  itemType?: "event" | "stay";
  stayLat?: number;
  stayLng?: number;
  stayAddress?: string;
  stayData?: LegalStay;
};

export type AgentItineraryStop = {
  id: string;
  title: string;
  kind: "event" | "hotel" | "stay" | "other";
  imageUrl?: string;
  timeRange?: string;
  estimatedStayMinutes?: number;
  highlight?: string;
  location?: string;
  date?: string;
  price?: string;
  mapUrl?: string;
  directionsUrl?: string;
  transportMode?: string;
  estimatedTravelMinutes?: number;
  travelSummary?: string;
};

export type AgentMessagePayload =
  | { kind: "text"; text: string }
  | { kind: "recommendation_carousel"; introText?: string; title?: string; events: AgentRecommendationItem[] }
  | { kind: "itinerary_cards"; title?: string; introText?: string; date?: string; stops: AgentItineraryStop[] };

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function formatIsoTimeRange(startAt: unknown, endAt: unknown): string | undefined {
  const start = typeof startAt === "string" ? startAt : "";
  const end = typeof endAt === "string" ? endAt : "";
  if (!start || !end) return undefined;
  const startTime = start.slice(11, 16);
  const endTime = end.slice(11, 16);
  if (startTime.length !== 5 || endTime.length !== 5) return undefined;
  return `${startTime} - ${endTime}`;
}

function normalizeItineraryStop(raw: unknown, index: number): AgentItineraryStop | null {
  const obj = asObject(raw);
  if (!obj) return null;
  const title = typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : "";
  if (!title) return null;
  const typeRaw = typeof obj.type === "string" ? obj.type.toLowerCase() : "";
  const kind: AgentItineraryStop["kind"] =
    typeRaw === "event" ? "event" : typeRaw === "hotel" ? "hotel" : typeRaw === "stay" ? "stay" : "other";
  const location =
    (typeof obj.venue_name === "string" && obj.venue_name.trim()) ||
    (typeof obj.venue === "string" && obj.venue.trim()) ||
    (typeof obj.address === "string" && obj.address.trim()) ||
    (typeof obj.location === "string" && obj.location.trim()) ||
    undefined;
  const dateFromStartAt = typeof obj.start_at === "string" ? obj.start_at.slice(0, 10) : "";
  const date =
    (typeof obj.date === "string" && obj.date.trim()) ||
    (typeof obj.start_date === "string" && obj.start_date.trim()) ||
    (dateFromStartAt || undefined);
  const price =
    typeof obj.price === "string" && obj.price.trim()
      ? obj.price.trim()
      : obj.is_free === true
        ? "FREE"
        : undefined;
  const estimatedStayMinutes =
    typeof obj.estimated_stay_minutes === "number" && Number.isFinite(obj.estimated_stay_minutes)
      ? Math.max(0, Math.round(obj.estimated_stay_minutes))
      : undefined;
  const estimatedTravelMinutes =
    typeof obj.estimated_travel_minutes === "number" && Number.isFinite(obj.estimated_travel_minutes)
      ? Math.max(0, Math.round(obj.estimated_travel_minutes))
      : undefined;

  return {
    id: String(obj.uid ?? obj.id ?? `${index}`),
    title,
    kind,
    imageUrl:
      (typeof obj.imageUrl === "string" && obj.imageUrl.trim()) ||
      (typeof obj.image_url === "string" && obj.image_url.trim()) ||
      (typeof obj.primaryImageUrl === "string" && obj.primaryImageUrl.trim()) ||
      (typeof obj.primary_image_url === "string" && obj.primary_image_url.trim()) ||
      undefined,
    timeRange:
      (typeof obj.time_range === "string" && obj.time_range.trim()) ||
      formatIsoTimeRange(obj.start_at, obj.end_at),
    estimatedStayMinutes,
    highlight:
      (typeof obj.reason === "string" && obj.reason.trim()) ||
      (typeof obj.note === "string" && obj.note.trim()) ||
      undefined,
    location,
    date,
    price,
    mapUrl: typeof obj.map_url === "string" && obj.map_url.trim() ? obj.map_url.trim() : undefined,
    directionsUrl: typeof obj.directions_url === "string" && obj.directions_url.trim() ? obj.directions_url.trim() : undefined,
    transportMode: typeof obj.travel_mode === "string" && obj.travel_mode.trim() ? obj.travel_mode.trim() : undefined,
    estimatedTravelMinutes,
    travelSummary: typeof obj.travel_summary === "string" && obj.travel_summary.trim() ? obj.travel_summary.trim() : undefined,
  };
}

function extractItineraryPayload(candidate: unknown): AgentMessagePayload | null {
  const root = asObject(candidate);
  if (!root) return null;
  const directItinerary = Array.isArray(root.itinerary) ? root.itinerary : null;
  const directTimeline = Array.isArray(root.timeline) ? root.timeline : null;
  const sourceArray = directItinerary ?? directTimeline;
  if (sourceArray) {
    const stops = sourceArray
      .map((item, idx) => normalizeItineraryStop(item, idx))
      .filter((item): item is AgentItineraryStop => Boolean(item));
    if (stops.length > 0) {
      return {
        kind: "itinerary_cards",
        title: typeof root.summary === "string" && root.summary.trim() ? root.summary.trim() : "AI 行程規劃",
        introText: typeof root.notes === "string" ? root.notes : undefined,
        date: typeof root.date === "string" ? root.date : undefined,
        stops,
      };
    }
  }
  for (const value of Object.values(root)) {
    const nested = extractItineraryPayload(value);
    if (nested) return nested;
  }
  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      const nested = extractItineraryPayload(item);
      if (nested) return nested;
    }
  }
  return null;
}

function extractItineraryFromText(replyText: string): AgentMessagePayload | null {
  const raw = (replyText || "").trim();
  if (!raw) return null;
  const hasItinerarySignal =
    /行程|規劃|规划|itinerary|timeline|交通|時間安排|注意事項/i.test(raw) &&
    /(^|\n)\s*\d+\.\s*/m.test(raw);
  if (!hasItinerarySignal) return null;

  const stopStarts = [...raw.matchAll(/(^|\n)\s*(\d+)\.\s*/gm)];
  if (stopStarts.length === 0) return null;

  const stops: AgentItineraryStop[] = [];
  for (let i = 0; i < stopStarts.length; i += 1) {
    const start = stopStarts[i].index ?? 0;
    const end = i + 1 < stopStarts.length ? stopStarts[i + 1].index ?? raw.length : raw.length;
    const block = raw.slice(start, end).trim();
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const heading = lines[0].replace(/^\d+\.\s*/, "").trim();
    const title = heading.replace(/^\[[^\]]+\]\s*/, "").trim();
    if (!title) continue;
    const kind: AgentItineraryStop["kind"] = /\[旅宿\]|\[住宿\]|hotel|stay/i.test(heading) ? "stay" : "event";

    const content = lines.slice(1).join("\n");
    const getField = (patterns: RegExp[]): string | undefined => {
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match?.[1]) return match[1].trim();
      }
      return undefined;
    };
    const timeRange = getField([/時間(?:範圍|區間)?[：:]\s*([^\n]+)/i, /time(?:\s*range)?[：:]\s*([^\n]+)/i]) ?? (heading.match(/(\d{1,2}:\d{2}\s*[-~–—]\s*\d{1,2}:\d{2})/)?.[1]);
    const estimatedStayText = getField([/(?:預計)?停留(?:時間)?[：:]\s*([^\n]+)/i]);
    const estimatedStayMinutes = estimatedStayText ? Number((estimatedStayText.match(/(\d+)/)?.[1] ?? "")) || undefined : undefined;
    const estimatedTravelText = getField([/(?:預計)?交通(?:時間)?[：:]\s*([^\n]+)/i, /travel(?:\s*time)?[：:]\s*([^\n]+)/i]);
    const estimatedTravelMinutes = estimatedTravelText ? Number((estimatedTravelText.match(/(\d+)/)?.[1] ?? "")) || undefined : undefined;

    stops.push({
      id: `text-stop-${i + 1}`,
      title,
      kind,
      timeRange,
      estimatedStayMinutes,
      highlight: getField([/(?:推薦)?亮點[：:]\s*([^\n]+)/i, /注意事項[：:]\s*([^\n]+)/i, /note[s]?[：:]\s*([^\n]+)/i]),
      location: getField([/(?:地點|地址|場館)[：:]\s*([^\n]+)/i, /location[：:]\s*([^\n]+)/i]),
      date: getField([/(?:日期|檔期)[：:]\s*([^\n]+)/i, /date[：:]\s*([^\n]+)/i]),
      price: getField([/(?:價格|票價|費用)[：:]\s*([^\n]+)/i, /price[：:]\s*([^\n]+)/i]),
      mapUrl: getField([/(?:地圖連結|地圖|map(?:\s*url)?)[：:]\s*(https?:\/\/[^\s]+)/i]),
      directionsUrl: getField([/(?:導航(?:路線)?|directions?)[：:]\s*(https?:\/\/[^\s]+)/i]),
      transportMode: getField([/(?:交通方式|交通)[：:]\s*([^\n]+)/i, /transport(?:\s*mode)?[：:]\s*([^\n]+)/i]),
      estimatedTravelMinutes,
      travelSummary: estimatedTravelText,
    });
  }

  if (stops.length === 0) return null;
  return {
    kind: "itinerary_cards",
    title: "AI 行程規劃",
    introText: "以下為從文字回覆自動整理的行程卡片",
    stops,
  };
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function authHeaders(extra?: Record<string, string>): HeadersInit {
  const token = getAuthToken();
  const base: Record<string, string> = { ...(extra ?? {}) };
  if (token) base["Authorization"] = `Bearer ${token}`;
  return base;
}

async function handleJson<T>(response: Response, fallbackMsg: string): Promise<T> {
  if (!response.ok) {
    let detail = fallbackMsg;
    try {
      const body = await response.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* noop */
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

const HOME_RECOMMENDATIONS_CACHE = new Map<string, Promise<Exhibition[]>>();
const HOME_RECOMMENDATIONS_PAGE_CACHE = new Map<string, Promise<HomeRecommendationsResponse>>();

function cacheKeyForParams(params: Record<string, unknown>, token: string | null) {
  const normalized = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify({ params: normalized, auth: token ?? "anon" });
}

async function getOrCreateSession() {
  let sessionId = localStorage.getItem('adk_session');
  if (sessionId) return sessionId;

  const response = await fetch(`/api/apps/${APP_NAME}/users/${USER_ID}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  if (!response.ok) throw new Error("Failed to create ADK session");

  const data = await response.json();
  localStorage.setItem('adk_session', data.id);
  return data.id;
}

export const sendMessageToAgent = async (message: string, options: { locale?: string } = {}) => {
  let sessionId = await getOrCreateSession();

  let response = await fetch('/api/run', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      appName: APP_NAME,
      userId: USER_ID,
      sessionId: sessionId,
      locale: options.locale,
      newMessage: { role: "user", parts: [{ text: message }] }
    })
  });

  if (response.status === 404) {
    localStorage.removeItem('adk_session');
    sessionId = await getOrCreateSession();
    response = await fetch('/api/run', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        appName: APP_NAME,
        userId: USER_ID,
        sessionId: sessionId,
        locale: options.locale,
        newMessage: { role: "user", parts: [{ text: message }] }
      })
    });
  }

  if (!response.ok) {
    if (response.status === 403) throw new Error("Forbidden: ADK rejected the request. Please restart the backend server.");
    throw new Error(`Failed to fetch from backend: ${response.statusText}`);
  }

  const data = await response.json();

  let reply = "Sorry, I couldn't process that.";
  let payload: AgentMessagePayload = { kind: "text", text: reply };
  const eventStream = Array.isArray(data) ? data : [data];
  if (Array.isArray(eventStream) && eventStream.length > 0) {
    const carouselEvent = eventStream.slice().reverse().find(
      (e) =>
        e?.recommendation_carousel ||
        e?.output?.recommendation_carousel ||
        e?.message?.recommendation_carousel ||
        e?.content?.recommendation_carousel ||
        e?.data?.recommendation_carousel,
    );
    const itineraryPayload = extractItineraryPayload(eventStream);
    const textEvent = eventStream.slice().reverse().find(
      (e) =>
        e?.message?.text ||
        e?.output?.text ||
        e?.content?.text ||
        e?.content?.parts?.[0]?.text,
    );
    const finalEvent = carouselEvent ?? textEvent;
    if (finalEvent && typeof finalEvent === "object") {
      reply = finalEvent.message?.text || finalEvent.output?.text || finalEvent.content?.text || finalEvent.content?.parts?.[0]?.text || JSON.stringify(finalEvent);
      const structured =
        finalEvent?.recommendation_carousel ||
        finalEvent?.output?.recommendation_carousel ||
        finalEvent?.message?.recommendation_carousel ||
        finalEvent?.content?.recommendation_carousel ||
        finalEvent?.data?.recommendation_carousel;

      if (itineraryPayload) {
        payload = itineraryPayload;
      } else if (structured && Array.isArray(structured.events)) {
        const events = structured.events
          .map((event: any): AgentRecommendationItem | null => {
            if (!event?.id || !event?.title) return null;
            return {
              id: String(event.id),
              title: String(event.title),
              dateStr: String(event.dateStr ?? event.date ?? "日期待確認"),
              location: String(event.location ?? "地點待確認"),
              imageUrl: String(event.imageUrl ?? event.image_url ?? ""),
              reason: typeof event.reason === "string" ? event.reason : undefined,
              itemType: event.itemType === "stay" ? "stay" : "event",
              stayLat: typeof event.stayLat === "number" ? event.stayLat : undefined,
              stayLng: typeof event.stayLng === "number" ? event.stayLng : undefined,
              stayAddress: typeof event.stayAddress === "string" ? event.stayAddress : undefined,
              stayData: event?.stayData && typeof event.stayData === "object" ? (event.stayData as LegalStay) : undefined,
            };
          })
          .filter((event: AgentRecommendationItem | null): event is AgentRecommendationItem => Boolean(event));

        if (events.length > 0) {
          payload = {
            kind: "recommendation_carousel",
            introText: typeof structured.introText === "string" ? structured.introText : undefined,
            title: typeof structured.title === "string" ? structured.title : undefined,
            events,
          };
        } else {
          payload = extractItineraryFromText(reply) ?? { kind: "text", text: reply };
        }
      } else {
        payload = extractItineraryFromText(reply) ?? { kind: "text", text: reply };
      }
    } else if (itineraryPayload) {
      payload = itineraryPayload;
    }
  }

  return payload;
};

export const getHomeRecommendations = async (params: {
  limit?: number;
  offset?: number;
  locale?: string;
} = {}): Promise<Exhibition[]> => {
  const token = getAuthToken();
  const cacheKey = cacheKeyForParams(params, token);
  const cached = HOME_RECOMMENDATIONS_CACHE.get(cacheKey);
  if (cached) return cached;

  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) search.set(key, String(value));
  });
  const request = fetch(`/api/recommendations/home${search.size ? `?${search}` : ""}`, {
    headers: authHeaders(),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("Failed to fetch home recommendations");
      const data = await response.json();
      return data.exhibitions as Exhibition[];
    })
    .catch((error) => {
      HOME_RECOMMENDATIONS_CACHE.delete(cacheKey);
      throw error;
    });
  HOME_RECOMMENDATIONS_CACHE.set(cacheKey, request);
  return request;
};

export type HomeRecommendationsResponse = {
  exhibitions: Exhibition[];
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
  personalized?: boolean;
};

export const getHomeRecommendationsPage = async (params: {
  limit?: number;
  offset?: number;
  locale?: string;
} = {}): Promise<HomeRecommendationsResponse> => {
  const token = getAuthToken();
  const cacheKey = cacheKeyForParams(params, token);
  const cached = HOME_RECOMMENDATIONS_PAGE_CACHE.get(cacheKey);
  if (cached) return cached;

  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) search.set(key, String(value));
  });
  const request = fetch(`/api/recommendations/home${search.size ? `?${search}` : ""}`, {
    headers: authHeaders(),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("Failed to fetch home recommendations");
      const data = await response.json();
      return {
        exhibitions: Array.isArray(data.exhibitions) ? data.exhibitions : [],
        offset: Number(data.offset ?? params.offset ?? 0),
        limit: Number(data.limit ?? params.limit ?? 0),
        total: Number(data.total ?? 0),
        hasMore: Boolean(data.hasMore),
        personalized: Boolean(data.personalized),
      };
    })
    .catch((error) => {
      HOME_RECOMMENDATIONS_PAGE_CACHE.delete(cacheKey);
      throw error;
    });
  HOME_RECOMMENDATIONS_PAGE_CACHE.set(cacheKey, request);
  return request;
};

export const listAvailableTags = async (): Promise<string[]> => {
  const response = await fetch('/api/tags');
  if (!response.ok) throw new Error("Failed to fetch tag suggestions");
  const data = await response.json();
  if (!Array.isArray(data?.tags)) return [];
  return data.tags
    .map((tag: unknown) => String(tag ?? "").trim())
    .filter(Boolean);
};

export interface TagStat {
  tag: string;
  count: number;
}

export const listTagStats = async (): Promise<TagStat[]> => {
  const response = await fetch('/api/tags/stats');
  if (!response.ok) throw new Error("Failed to fetch tag stats");
  const data = await response.json();
  if (!Array.isArray(data?.tags)) return [];
  return data.tags
    .map((row: unknown) => {
      const item = row as { tag?: unknown; count?: unknown };
      const tag = String(item?.tag ?? "").trim();
      const countRaw = Number(item?.count ?? 0);
      const count = Number.isFinite(countRaw) ? Math.max(0, Math.floor(countRaw)) : 0;
      if (!tag) return null;
      return { tag, count };
    })
    .filter((item: TagStat | null): item is TagStat => Boolean(item));
};

export const getCollectionRecommendations = async (params: { locale?: string } = {}) => {
  const search = new URLSearchParams();
  if (params.locale) search.set("locale", params.locale);
  const response = await fetch(`/api/recommendations/collection${search.size ? `?${search}` : ""}`, { headers: authHeaders() });
  if (!response.ok) throw new Error("Failed to fetch collection recommendations");
  const data = await response.json();
  return {
    collectionExhibitions: data.collectionExhibitions,
    recommendations: data.recommendations
  };
};

export const getMoreCollectionRecommendations = async (params: { locale?: string } = {}) => {
  const search = new URLSearchParams();
  if (params.locale) search.set("locale", params.locale);
  const response = await fetch(`/api/recommendations/collection/more${search.size ? `?${search}` : ""}`, { headers: authHeaders() });
  if (!response.ok) throw new Error("Failed to fetch more recommendations");
  const data = await response.json();
  return data.recommendations as { id: string; title: string; tag: string; location: string; imageUrl: string }[];
};

// ─── Legal Stays Dataset ─────────────────────────────────────────────────────
export interface LegalStay {
  id: string;
  licenseNumber: string;
  name: string;
  nameEn?: string;
  alternateNames: string[];
  description: string;
  descriptionEn?: string;
  operatorName: string;
  address: {
    city: string;
    cityEn?: string;
    cityCode: string;
    town: string;
    townEn?: string;
    townCode: string;
    zipCode: string;
    street: string;
    streetEn?: string;
    full: string;
    fullEn?: string;
  };
  location: { lat: number; lng: number };
  classCodes: number[];
  classLabels: string[];
  classLabelsEn?: string[];
  starRating: number;
  taiwanHost: number;
  serviceStatus: number;
  serviceStatusLabel: string;
  serviceStatusLabelEn?: string;
  phones: string[];
  urls: {
    website: string;
    reservation: string[];
    map: string[];
    sameAs: string[];
    socialMedia: string[];
  };
  images: Array<{
    url: string;
    name: string;
    description: string;
    width: number | null;
    height: number | null;
    keywords: string[];
    source: string;
    sourceLabel: string;
    license: string;
    attribution: string;
    pageUrl?: string;
    storagePolicy?: string;
  }>;
  primaryImageUrl: string;
  mediaDetailUrl: string;
  imageSourcePolicy: {
    source: string;
    license: string;
    attribution: string;
    storagePolicy?: string;
  };
  facilities: string[];
  paymentMethods: string[];
  parkingInfo: string;
  roomInfo: string;
  serviceInfo: string;
  totalRooms: number;
  totalCapacity: number;
  priceRange: { lowest: number; ceiling: number };
  accessibility: {
    accessibleRooms: number;
    toilets: number;
    liftingEquipments: number;
    parkingSpaces: number;
  };
  remarks: string;
  updateTime: string;
  source: string;
  searchText: string;
}

export interface LegalStaysResponse {
  metadata: Record<string, unknown>;
  total: number;
  offset: number;
  limit: number;
  locale?: string;
  stays: LegalStay[];
}

export interface LegalStaysGeoJson {
  type: "FeatureCollection";
  metadata?: Record<string, unknown>;
  features: Array<{
    type: "Feature";
    id: string;
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: Record<string, unknown>;
  }>;
}

export const listLegalStays = async (params: {
  q?: string;
  city?: string;
  town?: string;
  class?: string;
  service_status?: number;
  locale?: string;
  lang?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<LegalStaysResponse> => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const response = await fetch(`/api/legal-stays${search.size ? `?${search}` : ""}`);
  return handleJson<LegalStaysResponse>(response, "Failed to load legal stays");
};

export const getLegalStaysGeoJson = async (params: {
  q?: string;
  city?: string;
  town?: string;
  class?: string;
  service_status?: number;
  locale?: string;
  lang?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<LegalStaysGeoJson> => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const response = await fetch(`/api/legal-stays/geojson${search.size ? `?${search}` : ""}`);
  return handleJson<LegalStaysGeoJson>(response, "Failed to load legal stays GeoJSON");
};

// ─── Auth ────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  google_sub: string | null;
  google_email: string | null;
  created_at: string;
}

export interface AuthTokenPayload {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export const register = async (body: {
  email: string;
  password: string;
  display_name: string;
}): Promise<AuthTokenPayload> => {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleJson<AuthTokenPayload>(response, "註冊失敗，請稍後再試");
};

export const login = async (body: { email: string; password: string }): Promise<AuthTokenPayload> => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleJson<AuthTokenPayload>(response, "登入失敗，請稍後再試");
};

export const fetchMe = async (): Promise<AuthUser> => {
  const response = await fetch('/api/auth/me', { headers: authHeaders() });
  return handleJson<AuthUser>(response, "Failed to load user");
};

// ─── Favorites (auth required) ───────────────────────────────────────────────
export interface RemoteFavorite {
  exhibition_id: string;
  payload: Partial<Exhibition> & Record<string, unknown>;
  created_at: string;
}

export const listRemoteFavorites = async (): Promise<RemoteFavorite[]> => {
  const response = await fetch('/api/favorites', { headers: authHeaders() });
  return handleJson<RemoteFavorite[]>(response, "Failed to load favorites");
};

export const addRemoteFavorite = async (exhibition: Exhibition): Promise<RemoteFavorite> => {
  const response = await fetch('/api/favorites', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ exhibition_id: exhibition.id, payload: exhibition }),
  });
  return handleJson<RemoteFavorite>(response, "Failed to save favorite");
};

export const deleteRemoteFavorite = async (exhibitionId: string): Promise<void> => {
  const response = await fetch(`/api/favorites/${encodeURIComponent(exhibitionId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!response.ok && response.status !== 204) {
    throw new Error("Failed to remove favorite");
  }
};
