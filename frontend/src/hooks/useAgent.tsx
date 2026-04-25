import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { sendMessageToAgent } from '../lib/api';
import type { AgentRecommendationItem } from '../lib/api';

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

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'user', text }]);
    
    try {
      const result = await sendMessageToAgent(text);
      if (result.kind === 'recommendation_carousel') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'agent',
            kind: 'recommendation_carousel',
            title: result.title,
            introText: result.introText,
            events: result.events,
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: 'agent', kind: 'text', text: result.text }]);
      }
    } catch (e: any) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'agent', kind: 'text', text: `Connection Error: ${e.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const value = useMemo(
    () => ({ messages, isLoading, sendMessage }),
    [messages, isLoading],
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
