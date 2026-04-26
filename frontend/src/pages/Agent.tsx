import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useAgent } from "@/hooks/useAgent";
import { RecommendationCarousel } from "@/components/agent/RecommendationCarousel";
import { ItineraryCards } from "@/components/agent/ItineraryCards";
import { getLocaleCopy, useLanguage } from "@/lib/language";

export function Agent() {
  const { theme } = useTheme();
  const isV1 = theme === "v1";
  const { locale } = useLanguage();
  const copy = getLocaleCopy(locale, {
    "zh-TW": {
      autoSendFailedSuffix: "自動傳送失敗，請重試。",
      retrySend: "重新傳送",
      loadingText: "Vibing with the data...",
      inputPlaceholder: "請輸入你想找的展覽條件...",
    },
    en: {
      autoSendFailedSuffix: "auto-send failed. Please retry.",
      retrySend: "Retry",
      loadingText: "Vibing with the data...",
      inputPlaceholder: "Ask for an exhibition...",
    },
    fr: {
      autoSendFailedSuffix: ". Veuillez réessayer.",
      retrySend: "Réessayer l'envoi",
      loadingText: "Chargement…",
      inputPlaceholder: "Écrivez votre message…",
    },
  });
  const [input, setInput] = useState("");
  const { messages, isLoading, sendMessage, retryFailedPrefill, failedPrefillLabel } = useAgent();
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
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden px-3 pb-4 pt-2 sm:px-5 sm:pb-5 sm:pt-3 lg:px-8">
      <div className={`flex-1 min-h-0 min-w-0 border border-white/10 bg-[#120f1c] ${isV1 ? "rounded-md" : "rounded-3xl"} overflow-hidden flex flex-col`}>
        <div className="px-5 py-4 border-b border-purple-500/20 bg-[#2a1b38]/50 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-purple-300" />
          <h3 className="font-semibold text-purple-100">ExhiBeat AI</h3>
        </div>
        {failedPrefillLabel ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100 sm:px-5">
            <span className="min-w-0 break-words">{failedPrefillLabel} {copy.autoSendFailedSuffix}</span>
            <button
              type="button"
              onClick={() => void retryFailedPrefill()}
              className="rounded-full border border-amber-300/30 px-3 py-1 font-semibold text-amber-50 hover:bg-amber-300/10"
            >
              {copy.retrySend}
            </button>
          </div>
        ) : null}
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 space-y-4 sm:p-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex min-w-0 flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
              {msg.role === "agent" && msg.kind === "recommendation_carousel" ? (
                <RecommendationCarousel title={msg.title} introText={msg.introText} events={msg.events} />
              ) : msg.role === "agent" && msg.kind === "itinerary_cards" ? (
                <ItineraryCards title={msg.title} introText={msg.introText} date={msg.date} stops={msg.stops} />
              ) : (
                <div
                  className={`max-w-[92%] sm:max-w-[85%] px-4 py-2 rounded-2xl shadow-sm ${
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
                <span className="text-sm">{copy.loadingText}</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} className="h-1" />
        </div>
        <form onSubmit={handleSend} className="border-t border-purple-500/20 bg-[#0d0a10] p-3 sm:p-4">
          <div className="flex items-center gap-2 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={copy.inputPlaceholder}
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
