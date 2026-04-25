import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Settings, LogIn, LogOut, User as UserIcon, Heart, Sparkles, Menu, X, Languages } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { listTagStats, type TagStat } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const CUSTOM_TAG_STORAGE_KEY = "exhibeat_custom_tags_by_exhibition_v1";

function normalizeHashtag(value: string): string {
  const stripped = String(value ?? "").trim().replace(/^#+/, "").replace(/\s+/g, "");
  if (!stripped) return "";
  return `#${stripped}`;
}

function loadCustomTagCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CUSTOM_TAG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const counts: Record<string, number> = {};
    Object.values(parsed).forEach((value) => {
      if (!Array.isArray(value)) return;
      const deduped = new Set<string>();
      value.forEach((item) => {
        const normalized = normalizeHashtag(String(item ?? ""));
        if (normalized) deduped.add(normalized);
      });
      deduped.forEach((tag) => {
        counts[tag] = (counts[tag] ?? 0) + 1;
      });
    });
    return counts;
  } catch {
    return {};
  }
}

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [availableTagStats, setAvailableTagStats] = useState<TagStat[]>([]);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    setMenuOpen(false);
    setSettingsOpen(false);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const query = new URLSearchParams(location.search).get("q") ?? "";
    setSearchQuery(query);
  }, [location.pathname, location.search]);

  useEffect(() => {
    listTagStats()
      .then((data) => {
        setAvailableTagStats(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        console.warn("Failed to load search suggestions", error);
        setAvailableTagStats([]);
      });
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
      if (!settingsRef.current?.contains(e.target as Node)) setSettingsOpen(false);
      if (!mobileMenuRef.current?.contains(e.target as Node)) setMobileMenuOpen(false);
      if (!searchRef.current?.contains(e.target as Node)) setSearchSuggestionsOpen(false);
    };
    if (menuOpen || settingsOpen || mobileMenuOpen || searchSuggestionsOpen) {
      document.addEventListener("mousedown", onDocClick);
    }
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen, settingsOpen, mobileMenuOpen, searchSuggestionsOpen]);

  const normalizedQuery = searchQuery.trim();
  const isTagSearch = normalizedQuery.startsWith("#");
  const bareTagQuery = normalizedQuery.replace(/^#+/, "").trim().toLowerCase();
  const mergedTagStats = useMemo(() => {
    const merged = new Map<string, number>();
    availableTagStats.forEach((row) => {
      const tag = normalizeHashtag(row.tag);
      if (!tag) return;
      merged.set(tag, Math.max(0, Math.floor(Number(row.count) || 0)));
    });
    const customCounts = loadCustomTagCounts();
    Object.entries(customCounts).forEach(([tag, count]) => {
      const normalized = normalizeHashtag(tag);
      if (!normalized) return;
      merged.set(normalized, (merged.get(normalized) ?? 0) + Math.max(0, count));
    });
    return Array.from(merged.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag, "zh-Hant"));
  }, [availableTagStats, location.pathname, location.search, searchQuery]);

  const searchSuggestions = useMemo(() => {
    if (!isTagSearch) return [] as Array<{ tag: string; count: number }>;
    const rows: Array<{ tag: string; count: number }> = [];
    for (const row of mergedTagStats) {
      const cleanTag = row.tag.replace(/^#+/, "").toLowerCase();
      if (bareTagQuery && !cleanTag.startsWith(bareTagQuery)) continue;
      rows.push(row);
    }
    return rows.slice(0, 30);
  }, [bareTagQuery, isTagSearch, mergedTagStats]);

  const linkClass = (path: string) =>
    `text-sm font-medium transition-colors hover:text-foreground/90 ${
      location.pathname === path ? "text-primary border-b-2 border-primary pb-1" : "text-foreground/60"
    }`;

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    navigate("/");
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedSuggestion =
      activeSuggestionIndex >= 0 ? searchSuggestions[activeSuggestionIndex]?.tag : null;
    const q = (selectedSuggestion ?? searchQuery).trim();
    const search = q ? `?q=${encodeURIComponent(q)}` : "";
    setSearchSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
    navigate(`/${search}`);
  };

  const handleSuggestionClick = (suggestion: { tag: string; count: number }) => {
    setSearchQuery(suggestion.tag);
    setSearchSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
    navigate(`/?q=${encodeURIComponent(suggestion.tag)}`);
  };

  const initials = user?.display_name
    ? user.display_name.slice(0, 2).toUpperCase()
    : user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : "US";

  return (
    <nav className="fixed top-0 z-50 w-full h-20 flex items-center justify-between px-8 border-b border-white/5 bg-background/70 backdrop-blur-xl shadow-[0_8px_32px_rgba(223,142,255,0.08)]">
      <div className="flex items-center gap-8">
        <Link
          to="/"
          className="inline-block text-3xl font-extrabold py-1 tracking-tight"
          style={{ color: "#df8eff", fontFamily: '"The Seasons", serif', fontWeight: 400 }}
        >
          ExhiBeat
        </Link>
        <div className="hidden md:flex gap-6">
          <Link to="/" className={linkClass("/")}>首頁</Link>
          <Link to="/accommodations" className={linkClass("/accommodations")}>找住宿</Link>
          <Link to="/map" className={linkClass("/map")}>地圖探索</Link>
          <Link to="/agent" className={linkClass("/agent")}>AI 助手</Link>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <form className="relative hidden md:block" onSubmit={handleSearchSubmit} ref={searchRef}>
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              const value = e.target.value;
              setSearchQuery(value);
              setActiveSuggestionIndex(-1);
              const trimmed = value.trim();
              const shouldOpen = trimmed.startsWith("#");
              setSearchSuggestionsOpen(shouldOpen);
            }}
            onFocus={() => {
              const trimmed = searchQuery.trim();
              const shouldOpen = trimmed.startsWith("#");
              setSearchSuggestionsOpen(shouldOpen);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchSuggestionsOpen(false);
                setActiveSuggestionIndex(-1);
                return;
              }
              if (!searchSuggestionsOpen || searchSuggestions.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveSuggestionIndex((prev) => (prev + 1) % searchSuggestions.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveSuggestionIndex((prev) =>
                  prev <= 0 ? searchSuggestions.length - 1 : prev - 1,
                );
              }
            }}
            placeholder="搜尋展覽、藝術家...（#標籤）"
            className="h-9 w-64 rounded-md border border-white/10 bg-[#1f1f26]/80 pl-9 pr-4 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {searchSuggestionsOpen && (
            <div className="absolute left-0 right-0 mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-[#1a1625] shadow-xl z-50">
              {searchSuggestions.length > 0 ? (
                searchSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.tag}-${index}`}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    onMouseEnter={() => setActiveSuggestionIndex(index)}
                    className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors ${
                      index === activeSuggestionIndex
                        ? "bg-white/10 text-white"
                        : "text-white/80 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span>{suggestion.tag}</span>
                    <span className="text-xs text-white/50">{suggestion.count}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2.5 text-sm text-white/45">無符合標籤</div>
              )}
            </div>
          )}
        </form>
        {user ? (
          <Link
            to="/collection"
            className="text-muted-foreground hover:text-foreground transition-colors p-2 hover:bg-[#1f1f26] rounded-md"
            aria-label="我的收藏"
            title="我的收藏"
          >
            <Heart className="h-5 w-5" />
          </Link>
        ) : null}
        <div className="relative" ref={settingsRef}>
          <button
            type="button"
            onClick={() => {
              setSettingsOpen((o) => !o);
            }}
            className="text-muted-foreground hover:text-foreground transition-colors p-2 hover:bg-[#1f1f26] rounded-md"
            aria-haspopup="menu"
            aria-expanded={settingsOpen}
          >
            <Settings className="h-5 w-5" />
          </button>
          {settingsOpen && (
            <div className="absolute right-0 top-full mt-3 w-64 rounded-2xl border border-white/10 bg-[#1a1625] shadow-xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-sm font-semibold text-white">設定</p>
              </div>
              <div className="px-4 py-3 space-y-3">
                <Link to="/map" className="block text-sm text-white/80 hover:text-white">前往地圖探索</Link>
                <Link to="/accommodations" className="block text-sm text-white/80 hover:text-white">前往找住宿</Link>
                <Link to="/agent" className="block text-sm text-white/80 hover:text-white">前往 AI 助手</Link>
              </div>
            </div>
          )}
        </div>

        {user ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Avatar className="h-10 w-10 cursor-pointer ring-1 ring-white/20 hover:ring-primary/60 transition">
                <AvatarImage src="https://github.com/shadcn.png" alt={user.display_name} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-3 w-64 rounded-2xl border border-white/10 bg-[#1a1625] shadow-xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-white/5">
                  <p className="text-sm font-semibold text-white truncate">{user.display_name}</p>
                  <p className="text-xs text-white/50 truncate">{user.email}</p>
                </div>
                <button
                  type="button"
                  disabled
                  title="即將推出"
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/40 cursor-not-allowed"
                >
                  <UserIcon className="w-4 h-4" /> 個人資料（即將推出）
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-300 hover:bg-white/5 transition-colors border-t border-white/5"
                >
                  <LogOut className="w-4 h-4" /> 登出
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              state={{ from: location.pathname + location.search }}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-white/80 hover:text-white transition-colors"
            >
              <LogIn className="w-4 h-4" /> 登入
            </Link>
            <Link
              to="/register"
              state={{ from: location.pathname + location.search }}
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-4 rounded-full btn-gradient-safe text-sm font-semibold transition-colors"
            >
              <Sparkles className="w-4 h-4" /> 註冊
            </Link>
          </div>
        )}
        <div className="relative md:hidden" ref={mobileMenuRef}>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="p-2 rounded-md text-white/80 hover:text-white hover:bg-[#1f1f26] transition-colors"
            aria-label="開啟選單"
            aria-expanded={mobileMenuOpen}
            aria-haspopup="menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {mobileMenuOpen && (
            <div className="absolute right-0 top-full mt-3 w-64 rounded-2xl border border-white/10 bg-[#1a1625] shadow-xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-sm font-semibold text-white">導覽選單</p>
              </div>
              <div className="px-2 py-2">
                <Link to="/" className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg">首頁</Link>
                <Link to="/accommodations" className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg">找住宿</Link>
                <Link to="/map" className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg">地圖探索</Link>
                <Link to="/agent" className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg">AI 助手</Link>
                <div className="my-2 border-t border-white/10" />
                {!user ? (
                  <>
                    <Link
                      to="/login"
                      state={{ from: location.pathname + location.search }}
                      className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg"
                    >
                      登入
                    </Link>
                    <Link
                      to="/register"
                      state={{ from: location.pathname + location.search }}
                      className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg"
                    >
                      註冊
                    </Link>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 text-sm text-rose-300 hover:bg-white/5 rounded-lg"
                  >
                    登出
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
