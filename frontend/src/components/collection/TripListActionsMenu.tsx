import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { ActionToast } from "@/components/ActionToast";
import type { TripList } from "@/lib/tripLists";
import { getLocaleCopy, useLanguage } from "@/lib/language";

type Props = {
  list: TripList;
  canDelete: boolean;
  align?: "start" | "end";
  onRename: (listId: string, nextName: string) => void;
  onDelete: (listId: string) => void;
};

export function TripListActionsMenu({ list, canDelete, align = "end", onRename, onDelete }: Props) {
  const { locale } = useLanguage();
  const copy = getLocaleCopy(locale, {
    "zh-TW": {
      renamePrompt: "重新命名清單",
      renamedTo: (name: string) => `已重新命名為「${name}」`,
      deleteConfirm: (name: string) => `確定刪除「${name}」？此操作無法復原。`,
      deleted: (name: string) => `已刪除「${name}」`,
      aria: "清單操作",
      rename: "重新命名",
      delete: "刪除清單",
    },
    en: {
      renamePrompt: "Rename list",
      renamedTo: (name: string) => `Renamed to "${name}"`,
      deleteConfirm: (name: string) => `Delete "${name}"? This action cannot be undone.`,
      deleted: (name: string) => `Deleted "${name}"`,
      aria: "List actions",
      rename: "Rename",
      delete: "Delete list",
    },
    fr: {
      renamePrompt: "Nouveau nom de la liste",
      renamedTo: (name: string) => `Renommé en « ${name} »`,
      deleteConfirm: (name: string) => `Supprimer « ${name} » ? Cette action est irréversible.`,
      deleted: (name: string) => `« ${name} » supprimée`,
      aria: "Actions de liste",
      rename: "Renommer",
      delete: "Supprimer",
    },
  });
  const [open, setOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current && !rootRef.current.contains(target)) setOpen(false);
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

  const handleRename = () => {
    const name = window.prompt(copy.renamePrompt, list.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === list.name) return;
    onRename(list.id, trimmed);
    setToastMessage(copy.renamedTo(trimmed));
    setShowToast(true);
    setOpen(false);
  };

  const handleDelete = () => {
    if (!canDelete) return;
    const confirmed = window.confirm(copy.deleteConfirm(list.name));
    if (!confirmed) return;
    onDelete(list.id);
    setToastMessage(copy.deleted(list.name));
    setShowToast(true);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={copy.aria}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white/85 hover:bg-black/45"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute top-[calc(100%+6px)] z-[130] min-w-[150px] border border-white/10 bg-[#1a1625] p-1 text-white shadow-xl ${align === "end" ? "right-0" : "left-0"}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <button
            type="button"
            onClick={handleRename}
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-white hover:bg-white/10"
          >
            {copy.rename}
          </button>
          {canDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              className="mt-1 flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-red-300 hover:bg-red-500/15"
            >
              {copy.delete}
            </button>
          ) : null}
        </div>
      ) : null}
      <ActionToast open={showToast} message={toastMessage} />
    </div>
  );
}
