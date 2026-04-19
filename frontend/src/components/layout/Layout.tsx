import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { AgentChat } from "../AgentChat";

export function Layout() {
  return (
    <div className="min-h-screen bg-[#0d0a15] text-foreground flex flex-col font-sans selection:bg-purple-500/30 overflow-x-hidden">
      <Navbar />
      <main className="flex-1 w-full max-w-7xl mx-auto relative">
        <Outlet />
      </main>
      <Footer />
      <AgentChat />
    </div>
  );
}
