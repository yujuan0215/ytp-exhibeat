import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAgent } from '../hooks/useAgent';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { RecommendationCarousel } from './agent/RecommendationCarousel';
import { ItineraryCards } from './agent/ItineraryCards';

export function AgentChat() {
  const { pathname } = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const { messages, isLoading, sendMessage } = useAgent();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAgentPage = pathname === '/agent';

  // Auto-scroll to bottom whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isAgentPage) setIsOpen(false);
  }, [isAgentPage]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
  };

  return (
    <>
      {!isAgentPage && (
        <>
      {/* Floating Button Widget */}
      <button
        onClick={() => setIsOpen(true)}
        className={`bubble-pop fixed bottom-6 right-6 p-4 rounded-full bg-[#df8eff]/90 backdrop-blur-sm text-[#2f0f42] shadow-lg shadow-[#df8eff]/30 hover:scale-110 hover:shadow-[#df8eff]/50 transition-all z-50 duration-300 ${isOpen ? 'opacity-0 pointer-events-none scale-75' : 'opacity-100'}`}
        style={{ ["--bubble-color" as string]: "#df8eff" }}
      >
        <MessageCircle size={28} />
      </button>

      {/* Chat Window Panel */}
      <div
        className={`fixed bottom-6 right-6 w-[380px] h-[600px] max-h-[85vh] bg-[#120f1c] border border-[#df8eff]/35 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden transition-all duration-300 transform origin-bottom-right ${isOpen ? 'scale-100 opacity-100' : 'scale-75 opacity-0 pointer-events-none'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#df8eff]/25 bg-[#2a1b38]/50">
          <h3 className="font-semibold text-[#f3e8ff] flex items-center gap-2">
            <MessageCircle size={18} className="text-[#df8eff]" />
            ExhiBeat AI
          </h3>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div 
              key={i} 
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {msg.role === 'agent' && msg.kind === 'recommendation_carousel' ? (
                <RecommendationCarousel title={msg.title} introText={msg.introText} events={msg.events} />
              ) : msg.role === 'agent' && msg.kind === 'itinerary_cards' ? (
                <ItineraryCards title={msg.title} introText={msg.introText} date={msg.date} stops={msg.stops} />
              ) : (
                <div 
                  className={`max-w-[85%] px-4 py-2 rounded-2xl shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-[#df8eff]/90 text-[#2f0f42] rounded-br-sm backdrop-blur-sm'
                      : 'bg-white/5 text-purple-50 border border-white/10 rounded-bl-sm backdrop-blur-sm'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-start">
              <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl rounded-bl-sm text-purple-400 flex items-center gap-2 shadow-sm backdrop-blur-sm">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Vibing with the data...</span>
              </div>
            </div>
          )}
          {/* Invisible div to scroll to */}
          <div ref={messagesEndRef} className="h-1" />
        </div>

        {/* Input Area */}
        <form onSubmit={handleSend} className="p-4 border-t border-[#df8eff]/25 bg-[#0d0a10]">
          <div className="flex items-center gap-2 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask for an exhibition..."
              className="flex-1 bg-white/5 border border-white/10 text-white text-sm rounded-full pl-4 pr-12 py-3 focus:outline-none focus:border-[#df8eff]/60 focus:bg-white/10 transition-all placeholder:text-gray-500 shadow-inner"
              disabled={isLoading}
            />
            <button 
              type="submit" 
              disabled={!input.trim() || isLoading}
              className="absolute right-1.5 p-2 rounded-full bg-[#df8eff] text-[#2f0f42] disabled:opacity-0 disabled:scale-75 hover:bg-[#d680f6] transition-all duration-200"
            >
              <Send size={16} className="-ml-0.5" />
            </button>
          </div>
        </form>
      </div>
        </>
      )}
    </>
  );
}
