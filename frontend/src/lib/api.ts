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
};

export type AgentMessagePayload =
  | { kind: "text"; text: string }
  | { kind: "recommendation_carousel"; introText?: string; title?: string; events: AgentRecommendationItem[] };

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

export const sendMessageToAgent = async (message: string) => {
  let sessionId = await getOrCreateSession();

  let response = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appName: APP_NAME,
      userId: USER_ID,
      sessionId: sessionId,
      newMessage: { role: "user", parts: [{ text: message }] }
    })
  });

  if (response.status === 404) {
    localStorage.removeItem('adk_session');
    sessionId = await getOrCreateSession();
    response = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appName: APP_NAME,
        userId: USER_ID,
        sessionId: sessionId,
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
  if (Array.isArray(data)) {
    const finalEvent = data.slice().reverse().find(
      (e) =>
        e?.recommendation_carousel ||
        e?.output?.recommendation_carousel ||
        e?.message?.recommendation_carousel ||
        e?.content?.recommendation_carousel ||
        e?.data?.recommendation_carousel ||
        e?.message?.text ||
        e?.output?.text ||
        e?.content?.text ||
        e?.content?.parts?.[0]?.text,
    );
    if (finalEvent) {
      reply = finalEvent.message?.text || finalEvent.output?.text || finalEvent.content?.text || finalEvent.content?.parts?.[0]?.text || JSON.stringify(finalEvent);
      const structured =
        finalEvent?.recommendation_carousel ||
        finalEvent?.output?.recommendation_carousel ||
        finalEvent?.message?.recommendation_carousel ||
        finalEvent?.content?.recommendation_carousel ||
        finalEvent?.data?.recommendation_carousel;

      if (structured && Array.isArray(structured.events)) {
        const events = structured.events
          .map((event: any): AgentRecommendationItem | null => {
            if (!event?.id || !event?.title) return null;
            return {
              id: String(event.id),
              title: String(event.title),
              dateStr: String(event.dateStr ?? event.date ?? "日期待確認"),
              location: String(event.location ?? "地點待確認"),
              imageUrl: String(event.imageUrl ?? event.image_url ?? ""),
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
          payload = { kind: "text", text: reply };
        }
      } else {
        payload = { kind: "text", text: reply };
      }
    }
  }

  return payload;
};

export const getHomeRecommendations = async (): Promise<Exhibition[]> => {
  const response = await fetch('/api/recommendations/home');
  if (!response.ok) throw new Error("Failed to fetch home recommendations");
  const data = await response.json();
  return data.exhibitions;
};

export const getCollectionRecommendations = async () => {
  const response = await fetch('/api/recommendations/collection');
  if (!response.ok) throw new Error("Failed to fetch collection recommendations");
  const data = await response.json();
  return {
    collectionExhibitions: data.collectionExhibitions,
    recommendations: data.recommendations
  };
};

export const getMoreCollectionRecommendations = async () => {
  const response = await fetch('/api/recommendations/collection/more');
  if (!response.ok) throw new Error("Failed to fetch more recommendations");
  const data = await response.json();
  return data.recommendations as { id: string; title: string; tag: string; location: string; imageUrl: string }[];
};

// ─── Legal Stays Dataset ─────────────────────────────────────────────────────
export interface LegalStay {
  id: string;
  licenseNumber: string;
  name: string;
  alternateNames: string[];
  description: string;
  operatorName: string;
  address: {
    city: string;
    cityCode: string;
    town: string;
    townCode: string;
    zipCode: string;
    street: string;
    full: string;
  };
  location: { lat: number; lng: number };
  classCodes: number[];
  classLabels: string[];
  starRating: number;
  taiwanHost: number;
  serviceStatus: number;
  serviceStatusLabel: string;
  phones: string[];
  urls: {
    website: string;
    reservation: string[];
    map: string[];
    sameAs: string[];
    socialMedia: string[];
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
  preference_tags: string[];
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

export interface PreferenceOption {
  id: string;
  label: string;
  emoji: string;
}

export const listPreferenceOptions = async (): Promise<PreferenceOption[]> => {
  const response = await fetch('/api/auth/preference-options');
  return handleJson<PreferenceOption[]>(response, "Failed to load preference options");
};

export const register = async (body: {
  email: string;
  password: string;
  display_name: string;
  preference_tags: string[];
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

export const updatePreferences = async (preference_tags: string[]): Promise<AuthUser> => {
  const response = await fetch('/api/auth/me/preferences', {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ preference_tags }),
  });
  return handleJson<AuthUser>(response, "更新偏好標籤失敗");
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
