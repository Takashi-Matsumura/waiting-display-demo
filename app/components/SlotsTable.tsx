import { formatTimeRange, type SlotStat } from "@/app/hooks/useSlots";

/**
 * 時間枠一覧の読み取り専用テーブル。整理券発行時の確認用に、
 * イベント準備画面の「登録済みの時間枠」テーブルと同じ列を表示する
 * (準備/編集/削除などの操作列は持たない)。
 */
export default function SlotsTable({
  slots,
  isLoading,
}: {
  slots: SlotStat[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return <p className="text-sm text-zinc-500">読み込み中…</p>;
  }
  if (slots.length === 0) {
    return <p className="text-sm text-zinc-500">まだ時間枠がありません。</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-black/10 text-xs text-zinc-500 dark:border-white/10">
            <th className="px-4 py-3 font-medium">表示名</th>
            <th className="px-4 py-3 font-medium">キー</th>
            <th className="px-4 py-3 font-medium">時間</th>
            <th className="px-4 py-3 font-medium">発行 / 定員</th>
            <th className="px-4 py-3 font-medium">残</th>
            <th className="px-4 py-3 font-medium">次番号</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => {
            const suggested =
              slot.remaining > 0
                ? `${slot.key}-${String(slot.capacity - slot.remaining + 1).padStart(2, "0")}`
                : null;
            return (
              <tr key={slot.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                <td className="px-4 py-2 font-medium">{slot.label}</td>
                <td className="px-4 py-2 text-zinc-500">{slot.key}</td>
                <td className="px-4 py-2 text-zinc-500">
                  {formatTimeRange(slot.startTime, slot.endTime)}
                </td>
                <td className="px-4 py-2">
                  {slot.issued} / {slot.capacity}
                </td>
                <td className="px-4 py-2">{slot.remaining}</td>
                <td className="px-4 py-2 text-zinc-500">{suggested ?? "満員"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
