import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  PreSendPace,
  PreSendPlannerDraft,
  PreSendPlannedItem,
  PreSendTransportMode,
  TripList,
} from "@/lib/tripLists";

type Props = {
  open: boolean;
  list: TripList | null;
  onClose: () => void;
  onConfirm: (draft: PreSendPlannerDraft) => void;
};

type EditableItem = PreSendPlannedItem & { id: string };

const TRANSPORT_OPTIONS: { value: PreSendTransportMode; label: string }[] = [
  { value: "walk", label: "步行" },
  { value: "mrt", label: "捷運" },
  { value: "bus", label: "公車" },
  { value: "taxi", label: "計程車" },
  { value: "mixed", label: "混合" },
];

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(baseIsoDate: string, offset: number): string {
  const base = new Date(`${baseIsoDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + offset);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseAvailableRange(dateStr?: string): { start: string; end: string } | null {
  if (!dateStr) return null;
  const normalized = dateStr.replace(/\s+/g, " ");
  const matches = [...normalized.matchAll(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/g)]
    .map((m) => {
      const y = m[1];
      const mm = String(Number(m[2])).padStart(2, "0");
      const dd = String(Number(m[3])).padStart(2, "0");
      return `${y}-${mm}-${dd}`;
    })
    .filter(Boolean);
  if (matches.length === 0) return null;
  if (matches.length === 1) return { start: matches[0], end: matches[0] };
  const sorted = [...matches].sort();
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}

function getDateConflict(item: EditableItem, dayDates: string[]): { start: string; end: string } | null {
  if (item.kind !== "event") return null;
  const plannedDate = dayDates[item.day - 1];
  if (!plannedDate) return null;
  const range = parseAvailableRange(item.dateStr);
  if (!range) return null;
  const outOfRange = plannedDate < range.start || plannedDate > range.end;
  return outOfRange ? range : null;
}

function defaultItems(list: TripList | null): EditableItem[] {
  if (!list) return [];
  const normalized: EditableItem[] = [];
  list.items.forEach((item, index) => {
    if (item.kind === "event") {
      normalized.push({
        id: `event_${item.payload.id}_${index}`,
        kind: "event",
        title: item.payload.title,
        location: item.payload.location,
        dateStr: item.payload.dateStr,
        latitude: item.payload._meta?.latitude,
        longitude: item.payload._meta?.longitude,
        day: 1,
        order: index,
      });
      return;
    }
    if (item.kind === "stay") {
      normalized.push({
        id: `stay_${item.payload.id}_${index}`,
        kind: "stay",
        title: item.payload.name,
        location:
          item.payload.address?.full ||
          item.payload.address?.street ||
          item.payload.name ||
          "地點待確認",
        latitude: item.payload.location?.lat,
        longitude: item.payload.location?.lng,
        day: 1,
        order: index,
      });
    }
    // Ignore legacy/unknown item kinds that may still exist in localStorage.
  });
  return normalized;
}

export function SendToAgentPlannerModal({ open, list, onClose, onConfirm }: Props) {
  const [transportModes, setTransportModes] = useState<PreSendTransportMode[]>(["mixed"]);
  const [pace, setPace] = useState<PreSendPace>("balanced");
  const [dayCount, setDayCount] = useState(1);
  const [dayDates, setDayDates] = useState<string[]>([todayIsoDate()]);
  const [items, setItems] = useState<EditableItem[]>([]);

  useEffect(() => {
    if (!open) return;
    setTransportModes(["mixed"]);
    setPace("balanced");
    setDayCount(1);
    setDayDates([todayIsoDate()]);
    setItems(defaultItems(list));
  }, [open, list]);

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.order - b.order), [items]);

  if (!open || !list) return null;

  const toggleTransport = (value: PreSendTransportMode) => {
    setTransportModes((prev) => {
      if (prev.includes(value)) {
        const next = prev.filter((v) => v !== value);
        return next.length > 0 ? next : ["mixed"];
      }
      if (value === "mixed") return ["mixed"];
      return [...prev.filter((v) => v !== "mixed"), value];
    });
  };

  const moveItem = (id: string, direction: -1 | 1) => {
    setItems((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const index = sorted.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= sorted.length) return prev;
      [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
      return sorted.map((item, idx) => ({ ...item, order: idx }));
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id).map((item, idx) => ({ ...item, order: idx })));
  };

  const updateDay = (id: string, day: number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, day: Math.max(1, Math.min(dayCount, day)) } : item)),
    );
  };

  const handleAddDay = () => {
    setDayCount((prev) => {
      const next = Math.min(14, prev + 1);
      setDayDates((existing) => {
        if (existing.length >= next) return existing.slice(0, next);
        const seed = existing[existing.length - 1] || todayIsoDate();
        const appended = [...existing];
        while (appended.length < next) {
          appended.push(addDays(seed, appended.length - existing.length + 1));
        }
        return appended;
      });
      return next;
    });
  };

  const updateDayDate = (day: number, value: string) => {
    setDayDates((prev) => {
      const next = [...prev];
      while (next.length < dayCount) next.push("");
      next[day - 1] = value;
      return next;
    });
  };

  const handleConfirm = () => {
    const normalized = sortedItems
      .filter((item) => item.day >= 1 && item.day <= dayCount)
      .map((item, index) => ({ ...item, order: index }));
    if (normalized.length === 0) return;
    const conflictRows = normalized
      .map((item) => ({ item, conflict: getDateConflict(item, dayDates) }))
      .filter((row) => Boolean(row.conflict));
    if (conflictRows.length > 0) {
      const detail = conflictRows
        .slice(0, 4)
        .map((row) => {
          const plannedDate = dayDates[row.item.day - 1] || "未設定";
          return `- ${row.item.title}（Day ${row.item.day} / ${plannedDate}，可用區間 ${row.conflict!.start} ~ ${row.conflict!.end}）`;
        })
        .join("\n");
      window.alert(
        `目前有日期衝突，無法送出到助理。\n請先調整 Day 日期或項目分配後再試：\n\n${detail}`,
      );
      return;
    }
    onConfirm({
      transportModes,
      pace,
      dayCount,
      dayDates: dayDates.slice(0, dayCount),
      items: normalized.map(({ id: _id, ...rest }) => rest),
    });
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[84vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0f0d16]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-white">傳送前行程設定</h3>
            <p className="text-xs text-white/60">先調整偏好與分天順序，再送給助理產生推薦行程。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 p-2 text-white/75 hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4 overflow-y-auto border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
            <div>
              <p className="mb-2 text-sm text-white/80">交通模式</p>
              <div className="flex flex-wrap gap-2">
                {TRANSPORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleTransport(option.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs ${
                      transportModes.includes(option.value)
                        ? "border-cyan-300/70 bg-cyan-400/15 text-cyan-100"
                        : "border-white/15 text-white/75 hover:bg-white/10"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block text-sm text-white/80">
              行程節奏
              <select
                value={pace}
                onChange={(e) => setPace(e.target.value as PreSendPace)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
              >
                <option value="relaxed">relaxed</option>
                <option value="balanced">balanced</option>
                <option value="packed">packed</option>
              </select>
            </label>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-sm text-white/80">行程天數區段</p>
              <p className="mt-1 text-xs text-white/55">預設 Day 1，可新增更多天數區段。</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm font-semibold text-white">目前：{dayCount} 天</span>
                <Button
                  type="button"
                  onClick={handleAddDay}
                  className="h-8 rounded-full bg-purple-600 px-3 text-xs text-white hover:bg-purple-500"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  新增一天
                </Button>
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto p-5">
            {Array.from({ length: dayCount }).map((_, dayIndex) => {
              const day = dayIndex + 1;
              const dayItems = sortedItems.filter((item) => item.day === day);
              return (
                <section key={`day_${day}`} className="mb-5 rounded-xl border border-white/10 bg-white/5 p-4 last:mb-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-semibold text-white">Day {day}</h4>
                    <span className="text-white/45">:</span>
                    <input
                      type="date"
                      value={dayDates[day - 1] || ""}
                      onChange={(e) => updateDayDate(day, e.target.value)}
                      className="rounded-md border border-white/15 bg-[#17142a] px-2 py-1 text-xs text-white"
                    />
                  </div>
                  {dayItems.length === 0 ? (
                    <p className="text-xs text-white/55">此天尚未分配項目。</p>
                  ) : (
                    <div className="space-y-2">
                      {dayItems.map((item) => (
                        <div key={item.id} className="rounded-lg border border-white/10 bg-[#151225] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="line-clamp-1 text-sm font-semibold text-white">
                                  [{item.kind === "event" ? "展演" : "旅宿"}] {item.title}
                                </p>
                                {(() => {
                                  const conflict = getDateConflict(item, dayDates);
                                  if (!conflict) return null;
                                  return (
                                    <span
                                      className="shrink-0 cursor-help rounded-full border border-amber-300/40 bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100"
                                      title={`Planned date is out of available date range (${conflict.start} ~ ${conflict.end})`}
                                    >
                                      !
                                    </span>
                                  );
                                })()}
                              </div>
                              <p className="line-clamp-1 text-xs text-white/60">{item.location}</p>
                              {item.kind === "event" && item.dateStr ? (
                                <p className="line-clamp-1 text-[11px] text-cyan-200/80">可參加日期：{item.dateStr}</p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => moveItem(item.id, -1)}
                                className="rounded border border-white/20 p-1 text-white/70 hover:bg-white/10"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveItem(item.id, 1)}
                                className="rounded border border-white/20 p-1 text-white/70 hover:bg-white/10"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeItem(item.id)}
                                className="rounded border border-red-300/30 p-1 text-red-200 hover:bg-red-400/15"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-white/65">分配到</span>
                            <select
                              value={item.day}
                              onChange={(e) => updateDay(item.id, Number(e.target.value) || 1)}
                              className="rounded-md border border-white/15 bg-[#17142a] px-2 py-1 text-xs text-white"
                            >
                              {Array.from({ length: dayCount }).map((_, idx) => (
                                <option key={`${item.id}_day_${idx + 1}`} value={idx + 1}>
                                  Day {idx + 1}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            className="rounded-full bg-purple-600 text-white hover:bg-purple-500"
            onClick={handleConfirm}
            disabled={items.length === 0}
          >
            送出到助理
          </Button>
        </div>
      </div>
    </div>
  );
}
