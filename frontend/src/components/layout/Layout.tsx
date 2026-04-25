import { Outlet, useLocation } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { AgentChat } from "../AgentChat";

export function Layout() {
  const { pathname } = useLocation();
  const isAgentPage = pathname === "/agent";

  return (
    <div className={`min-h-screen bg-background text-foreground flex flex-col font-body selection:bg-primary/30 overflow-x-hidden ${isAgentPage ? "h-screen overflow-hidden" : ""}`}>
      <Navbar />
      <main className={`flex-1 w-full max-w-7xl mx-auto relative pt-20 ${isAgentPage ? "h-screen overflow-hidden" : ""}`}>
        <Outlet />
      </main>
      {!isAgentPage && <Footer />}
      <AgentChat />
    </div>
  );
}
