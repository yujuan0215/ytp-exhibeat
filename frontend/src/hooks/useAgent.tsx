import { useState } from 'react';
import { sendMessageToAgent } from '../lib/api';

export type Message = {
  role: 'user' | 'agent';
  text: string;
};

export function useAgent() {
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

  return { messages, isLoading, sendMessage };
}
