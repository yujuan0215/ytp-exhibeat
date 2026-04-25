import { Outlet, useLocation } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { AgentChat } from "../AgentChat";

export function Layout() {
  const { pathname } = useLocation();
  const isAgentPage = pathname === "/agent";
  const isMapPage = pathname === "/map";
  const useFullscreenShell = isAgentPage || isMapPage;
  const hideFooter = isAgentPage || isMapPage;

  return (
    <div className={`min-h-screen bg-background text-foreground flex flex-col font-body selection:bg-primary/30 overflow-x-hidden ${useFullscreenShell ? "h-screen overflow-hidden" : ""}`}>
      <Navbar />
      <main className={`flex-1 w-full relative pt-20 ${isMapPage ? "max-w-none h-screen overflow-hidden" : "max-w-7xl mx-auto"} ${isAgentPage ? "h-screen overflow-hidden" : ""}`}>
        <Outlet />
      </main>
      {!hideFooter && <Footer />}
      {!isMapPage && <AgentChat />}
    </div>
  );
}
