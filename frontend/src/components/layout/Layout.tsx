import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { AgentChat } from "../AgentChat";

export function Layout() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-body selection:bg-primary/30 overflow-x-hidden">
      <Navbar />
      <main className="flex-1 w-full max-w-7xl mx-auto relative pt-20">
        <Outlet />
      </main>
      <Footer />
      <AgentChat />
    </div>
  );
}
