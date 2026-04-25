import { useEffect, useRef, useState } from "react";
import { Check, MoreHorizontal } from "lucide-react";
import type { Exhibition } from "@/data/mock";
import type { LegalStay } from "@/lib/api";
import {
  addEventToTripList,
  addStayToTripList,
  createTripListWithFirstItem,
  DEFAULT_TRIP_LIST_ID_KEY,
  getTripLists,
  itemKey,
  removeItemKeyFromTripList,
  TRIP_LISTS_CHANGE_EVENT,
  type TripListItem,
} from "@/lib/tripLists";
import { isFavorited, toggleFavorite } from "@/lib/favorites";
import { ActionToast } from "@/components/ActionToast";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";

type Props =
  | { kind: "event"; exhibition: Exhibition; currentListId?: string | null; align?: "start" | "end"; requireAuth?: boolean }
  | { kind: "stay"; stay: LegalStay; currentListId?: string | null; align?: "start" | "end"; requireAuth?: boolean };

export function AddToTripListMenu(props: Props) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isV1 = theme === "v1";
  const align = props.align ?? "end";
  const currentListId = props.currentListId ?? null;
  const requireAuth = props.requireAuth ?? false;
  const [lists, setLists] = useState(getTripLists());
  const [open, setOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sync = () => setLists(getTripLists());
    window.addEventListener(TRIP_LISTS_CHANGE_EVENT, sync);
    return () => window.removeEventListener(TRIP_LISTS_CHANGE_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!showToast) return;
    const timer = window.setTimeout(() => setShowToast(false), 1800);
    return () => window.clearTimeout(timer);
  }, [showToast]);

  const item: TripListItem =
    props.kind === "event"
      ? { kind: "event", payload: props.exhibition }
      : { kind: "stay", payload: props.stay };
  const key = itemKey(item);
  const isInList = (listId: string) =>
    lists.find((list) => list.id === listId)?.items.some((listItem) => itemKey(listItem) === key) ?? false;

  const handleToggleInList = async (listId: string) => {
    const targetList = lists.find((list) => list.id === listId);
    if (!targetList) return;
    if (props.kind === "event" && listId === DEFAULT_TRIP_LIST_ID_KEY) {
      const currentlyFavorited = isFavorited(props.exhibition.id);
      await toggleFavorite(props.exhibition);
      const nextFavorited = !currentlyFavorited;
      setToastMessage(nextFavorited ? `已加入「${targetList.name}」` : `已從「${targetList.name}」移除`);
      setLists(getTripLists());
      setShowToast(true);
      return;
    }
    const currentlyInList = isInList(listId);
    if (currentlyInList) {
      removeItemKeyFromTripList(listId, key);
      setToastMessage(`已從「${targetList.name}」移除`);
    } else if (props.kind === "event") {
      addEventToTripList(listId, props.exhibition);
      setToastMessage(`已加入「${targetList.name}」`);
    } else {
      addStayToTripList(listId, props.stay);
      setToastMessage(`已加入「${targetList.name}」`);
    }
    setLists(getTripLists());
    setShowToast(true);
  };

  const handleCreateNew = () => {
    const suggested =
      props.kind === "event" ? `清單：${props.exhibition.title.slice(0, 12)}…` : `清單：${props.stay.name.slice(0, 12)}…`;
    let input: string | null = null;
    try {
      input = window.prompt("新行程清單名稱", suggested);
    } catch {
      input = suggested;
    }
    // Some environments block native prompt; fall back to suggested name.
    const name = (input ?? suggested).trim() || suggested;
    const list = createTripListWithFirstItem(name, item);
    setLists(getTripLists());
    setToastMessage(`已建立並加入「${list.name}」`);
    setShowToast(true);
    setOpen(false);
  };

  if (requireAuth && !user) return null;

  const handleRemoveFromCurrent = () => {
    if (!currentListId) return;
    removeItemKeyFromTripList(currentListId, key);
    setLists(getTripLists());
    const currentListName = lists.find((l) => l.id === currentListId)?.name ?? "目前清單";
    setToastMessage(`已從「${currentListName}」移除`);
    setShowToast(true);
    setOpen(false);
  };

  const inCurrentList =
    currentListId && lists.find((l) => l.id === currentListId)?.items.some((i) => itemKey(i) === key);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`z-20 p-2 ${isV1 ? "rounded-md" : "rounded-full"} bg-background/30 text-white backdrop-blur-md hover:bg-background/50`}
        aria-label="加入行程清單"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute top-[calc(100%+6px)] z-[120] min-w-[200px] border border-white/10 bg-[#1a1625] p-1 text-white shadow-xl ${align === "end" ? "right-0" : "left-0"}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div className="px-1.5 py-1 text-xs font-medium text-white/80">加入行程清單</div>
          {lists.length === 0 ? (
            <button type="button" onClick={handleCreateNew} className="flex w-full items-center rounded-md px-1.5 py-1 text-left text-sm text-white hover:bg-white/10">
              建立新清單並加入…
            </button>
          ) : (
            <>
              {lists.map((list) => (
                <button
                  type="button"
                  key={list.id}
                  onClick={() => void handleToggleInList(list.id)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm text-white hover:bg-white/10"
                >
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-4 w-4 items-center justify-center rounded border ${isInList(list.id) ? "border-emerald-400 bg-emerald-400/20 text-emerald-300" : "border-white/35 text-transparent"}`}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                  {list.name}
                </button>
              ))}
              <div className="-mx-1 my-1 h-px bg-white/10" />
              <button type="button" onClick={handleCreateNew} className="flex w-full items-center rounded-md px-1.5 py-1 text-left text-sm text-white hover:bg-white/10">
                新增清單並加入…
              </button>
            </>
          )}
          {inCurrentList && (
            <>
              <div className="-mx-1 my-1 h-px bg-white/10" />
              <button
                type="button"
                onClick={handleRemoveFromCurrent}
                className="flex w-full items-center rounded-md px-1.5 py-1 text-left text-sm text-red-300 hover:bg-red-500/15"
              >
                從此清單移除
              </button>
            </>
          )}
        </div>
      ) : null}
      <ActionToast open={showToast} message={toastMessage} />
    </div>
  );
}
