import { useTheme } from "@/lib/theme";
import type { TripList } from "@/lib/tripLists";
import { TripListMosaicHeader } from "./TripListMosaicHeader";
import { TripListActionsMenu } from "./TripListActionsMenu";

type Props = {
  lists: TripList[];
  selectedListId: string | null;
  onSelect: (id: string | null) => void;
  onCreateList: () => void;
  onRenameList: (listId: string, nextName: string) => void;
  onDeleteList: (listId: string) => void;
  canDeleteList: (list: TripList) => boolean;
};

export function TripListRail({
  lists,
  selectedListId,
  onSelect,
  onCreateList,
  onRenameList,
  onDeleteList,
  canDeleteList,
}: Props) {
  const { theme } = useTheme();
  const isV1 = theme === "v1";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-white">行程清單</h3>
        <button
          type="button"
          onClick={onCreateList}
          className={`shrink-0 px-3 py-1.5 text-xs font-semibold text-[#042028] bg-[#00d6ff] hover:bg-[#20deff] ${isV1 ? "rounded-md" : "rounded-full"}`}
        >
          新增
        </button>
      </div>
      <div className="max-h-[min(52vh,28rem)] space-y-2 overflow-y-auto pr-1">
        {lists.map((list) => {
          const selected = list.id === selectedListId;
          return (
            <div
              key={list.id}
              className={`border p-2 transition-colors ${
                selected
                  ? "border-cyan-300/50 bg-white/10"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              } ${isV1 ? "rounded-md" : "rounded-xl"}`}
            >
              <div className="mb-1 flex justify-end">
                <TripListActionsMenu
                  list={list}
                  canDelete={canDeleteList(list)}
                  onRename={onRenameList}
                  onDelete={onDeleteList}
                />
              </div>
              <button type="button" onClick={() => onSelect(list.id)} className="flex w-full gap-3 text-left">
                <div className="w-20 shrink-0">
                  <TripListMosaicHeader list={list} className="aspect-square !rounded-lg" />
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="truncate font-semibold text-white">{list.name}</p>
                  <p className="text-xs text-white/55">
                    {list.items.length} 項
                    {list.items.some((i) => i.kind === "stay") ? " · 含旅宿" : ""}
                  </p>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
