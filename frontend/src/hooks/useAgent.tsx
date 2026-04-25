import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sendMessageToAgent } from "../lib/api";
import type { AgentRecommendationItem } from "../lib/api";
import type { AgentItineraryStop } from "../lib/api";
import { AGENT_PREFILL_STORAGE_KEY, type AgentPrefillEnvelope } from "../lib/tripLists";

export type AgentUserMessage = {
  role: 'user';
  text: string;
};

export type AgentTextMessage = {
  role: 'agent';
  kind: 'text';
  text: string;
};

export type AgentRecommendationMessage = {
  role: 'agent';
  kind: 'recommendation_carousel';
  title?: string;
  introText?: string;
  events: AgentRecommendationItem[];
};

export type AgentItineraryMessage = {
  role: "agent";
  kind: "itinerary_cards";
  title?: string;
  introText?: string;
  date?: string;
  stops: AgentItineraryStop[];
};

export type Message = AgentUserMessage | AgentTextMessage | AgentRecommendationMessage | AgentItineraryMessage;

type AgentContextValue = {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
  retryFailedPrefill: () => Promise<void>;
  failedPrefillLabel: string | null;
};

const AgentContext = createContext<AgentContextValue | null>(null);
const CHAT_HISTORY_STORAGE_KEY = "exhibeat_agent_chat_history";

function readChatHistory(): Message[] | null {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as Message[];
  } catch {
    return null;
  }
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>(() => {
    const cached = readChatHistory();
    if (cached && cached.length > 0) return cached;
    return [{ role: "agent", kind: "text", text: "Hi! I am your ExhiBeat assistant. How can I help you find exhibitions or events today?" }];
  });
  const [isLoading, setIsLoading] = useState(false);
  const seenPrefillNonces = useRef(new Set<string>());
  const [failedPrefill, setFailedPrefill] = useState<{ text: string; label: string } | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    setIsLoading(true);
    setMessages((prev) => [...prev, { role: "user", text }]);

    try {
      const result = await sendMessageToAgent(text);
      if (result.kind === "recommendation_carousel") {
        setMessages((prev) => [
          ...prev,
          {
            role: "agent",
            kind: "recommendation_carousel",
            title: result.title,
            introText: result.introText,
            events: result.events,
          },
        ]);
      } else if (result.kind === "itinerary_cards") {
        setMessages((prev) => [
          ...prev,
          {
            role: "agent",
            kind: "itinerary_cards",
            title: result.title,
            introText: result.introText,
            date: result.date,
            stops: result.stops,
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "agent", kind: "text", text: result.text }]);
      }
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((prev) => [...prev, { role: "agent", kind: "text", text: `Connection Error: ${msg}` }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendPrefillMessage = useCallback(
    async (text: string, label: string) => {
      if (!text.trim()) return;
      setIsLoading(true);
      setMessages((prev) => [...prev, { role: "user", text }]);
      try {
        const result = await sendMessageToAgent(text);
        if (result.kind === "recommendation_carousel") {
          setMessages((prev) => [
            ...prev,
            {
              role: "agent",
              kind: "recommendation_carousel",
              title: result.title,
              introText: result.introText,
              events: result.events,
            },
          ]);
        } else if (result.kind === "itinerary_cards") {
          setMessages((prev) => [
            ...prev,
            {
              role: "agent",
              kind: "itinerary_cards",
              title: result.title,
              introText: result.introText,
              date: result.date,
              stops: result.stops,
            },
          ]);
        } else {
          setMessages((prev) => [...prev, { role: "agent", kind: "text", text: result.text }]);
        }
        setFailedPrefill(null);
      } catch (e: unknown) {
        console.error(e);
        const msg = e instanceof Error ? e.message : String(e);
        setMessages((prev) => [...prev, { role: "agent", kind: "text", text: `Connection Error: ${msg}` }]);
        setFailedPrefill({ text, label });
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const parsePrefill = (raw: string): { text: string; nonce: string; label: string } | null => {
    const parsed = JSON.parse(raw) as Partial<AgentPrefillEnvelope> & { text?: string; nonce?: string };
    const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
    if (!text) return null;
    const nonce = typeof parsed.nonce === "string" && parsed.nonce.trim()
      ? parsed.nonce.trim()
      : `legacy_${text.slice(0, 48)}`;
    const label = typeof parsed.listName === "string" && parsed.listName.trim()
      ? `「${parsed.listName.trim()}」`
      : "行程清單";
    return { text, nonce, label };
  };

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(AGENT_PREFILL_STORAGE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(AGENT_PREFILL_STORAGE_KEY);
      const parsed = parsePrefill(raw);
      if (!parsed) return;
      if (seenPrefillNonces.current.has(parsed.nonce)) return;
      seenPrefillNonces.current.add(parsed.nonce);
      void sendPrefillMessage(parsed.text, parsed.label);
    } catch {
      /* ignore */
    }
  }, [sendPrefillMessage]);

  const retryFailedPrefill = useCallback(async () => {
    if (!failedPrefill) return;
    await sendPrefillMessage(failedPrefill.text, failedPrefill.label);
  }, [failedPrefill, sendPrefillMessage]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* ignore storage write errors */
    }
  }, [messages]);

  const value = useMemo(
    () => ({ messages, isLoading, sendMessage, retryFailedPrefill, failedPrefillLabel: failedPrefill?.label ?? null }),
    [messages, isLoading, sendMessage, retryFailedPrefill, failedPrefill],
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return context;
}
