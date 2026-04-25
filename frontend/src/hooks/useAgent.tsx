import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { sendMessageToAgent } from '../lib/api';

export type Message = {
  role: 'user' | 'agent';
  text: string;
};

type AgentContextValue = {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
};

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'agent', text: 'Hi! I am your ExhiBeat assistant. How can I help you find exhibitions or events today?' }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'user', text }]);
    
    try {
      const result = await sendMessageToAgent(text);
      // Fallback check depending on exactly how your ADK returns data
      const replyText = result.reply || result.response || result.message || JSON.stringify(result);
      setMessages(prev => [...prev, { role: 'agent', text: replyText }]);
    } catch (e: any) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'agent', text: `Connection Error: ${e.message}` }]);
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
