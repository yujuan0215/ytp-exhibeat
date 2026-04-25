import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useAgent } from "@/hooks/useAgent";
import { RecommendationCarousel } from "@/components/agent/RecommendationCarousel";

export function Agent() {
  const { theme } = useTheme();
  const isV1 = theme === "v1";
  const [input, setInput] = useState("");
  const { messages, isLoading, sendMessage } = useAgent();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    void sendMessage(trimmed);
    setInput("");
  };

  return (
    <div className="px-8 py-6 w-full h-full overflow-hidden flex flex-col">
      <header className="mb-6 shrink-0">
        <h2 className="text-secondary text-sm font-bold tracking-widest uppercase mb-2">Assistant</h2>
        <h1 className="text-4xl font-extrabold text-white">AI 助手</h1>
      </header>

      <div className={`flex-1 min-h-0 border border-white/10 bg-[#120f1c] ${isV1 ? "rounded-md" : "rounded-3xl"} overflow-hidden flex flex-col`}>
        <div className="px-5 py-4 border-b border-purple-500/20 bg-[#2a1b38]/50 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-purple-300" />
          <h3 className="font-semibold text-purple-100">ExhiBeat AI</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
              {msg.role === "agent" && msg.kind === "recommendation_carousel" ? (
                <RecommendationCarousel title={msg.title} introText={msg.introText} events={msg.events} />
              ) : (
                <div
                  className={`max-w-[85%] px-4 py-2 rounded-2xl shadow-sm ${
                    msg.role === "user"
                      ? "bg-purple-600/90 text-white rounded-br-sm backdrop-blur-sm"
                      : "bg-white/5 text-purple-50 border border-white/10 rounded-bl-sm backdrop-blur-sm"
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
          <div ref={messagesEndRef} className="h-1" />
        </div>
        <form onSubmit={handleSend} className="p-4 border-t border-purple-500/20 bg-[#0d0a10]">
          <div className="flex items-center gap-2 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask for an exhibition..."
              className="flex-1 bg-white/5 border border-white/10 text-white text-sm rounded-full pl-4 pr-12 py-3 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all placeholder:text-gray-500 shadow-inner"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-1.5 p-2 rounded-full bg-purple-600 text-white disabled:opacity-0 disabled:scale-75 hover:bg-purple-500 transition-all duration-200"
            >
              <Send size={16} className="-ml-0.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
