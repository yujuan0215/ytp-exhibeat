import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sendMessageToAgent } from "../lib/api";
import type { AgentRecommendationItem } from "../lib/api";
import { AGENT_PREFILL_STORAGE_KEY } from "../lib/tripLists";

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

export type Message = AgentUserMessage | AgentTextMessage | AgentRecommendationMessage;

type AgentContextValue = {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
};

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'agent', kind: 'text', text: 'Hi! I am your ExhiBeat assistant. How can I help you find exhibitions or events today?' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const prefillConsumed = useRef(false);

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

  useEffect(() => {
    if (prefillConsumed.current) return;
    try {
      const raw = sessionStorage.getItem(AGENT_PREFILL_STORAGE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(AGENT_PREFILL_STORAGE_KEY);
      const parsed = JSON.parse(raw) as { text?: string };
      const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
      if (!text) return;
      prefillConsumed.current = true;
      void sendMessage(text);
    } catch {
      /* ignore */
    }
  }, [sendMessage]);

  const value = useMemo(
    () => ({ messages, isLoading, sendMessage }),
    [messages, isLoading, sendMessage],
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
