interface SlotStat {
  id: number;
  key: string;
  label: string;
  startTime: string | null;
  endTime: string | null;
  capacity: number;
  issued: number;
  checkedIn: number;
  remaining: number;
}

interface Totals {
  capacity: number;
  issued: number;
  checkedIn: number;
  remaining: number;
}

/**
 * 「現在開催中」を進捗バー付きで表示する。current/nextの判定はサーバー
 * (/api/stats)がローカル時刻で行い、そのまま受け取って描画するだけ。
 *
 * - 現在開催中の枠が無い場合は「現在受付中の枠はありません」と表示する
 *   (開始5分前からしか受付できない仕様のため、これは正常な状態)。
 * - 「次の開催」案内は current の有無に関わらず、next が存在すれば常に表示する。
 * - 「本日の受付は終了しました」は時刻ではなく、全整理券が発行済み(残数0)かどうかで判定する。
 *   時刻的に枠が残っていても、券が全て発行済みならこれ以上受付できないため。
 */
export default function CurrentNextBoard({
  current,
  next,
  totals,
}: {
  current: SlotStat | null;
  next: SlotStat | null;
  totals: Totals | null;
}) {
  const allIssued = totals !== null && totals.capacity > 0 && totals.remaining <= 0;

  return (
    <div className="flex flex-col gap-4">
      {current ? (
        <SlotProgressCard slot={current} badge="現在開催中" />
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-zinc-400">
          現在受付中の枠はありません
        </div>
      )}

      {allIssued ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-zinc-400">
          本日の受付は終了しました
        </div>
      ) : (
        next && <UpcomingCard slot={next} badge="次の開催" />
      )}
    </div>
  );
}

function UpcomingCard({ slot, badge }: { slot: SlotStat; badge: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-baseline justify-between">
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-zinc-300">
          {badge}
        </span>
        <span className="text-2xl font-bold">{slot.label}</span>
      </div>
      <p className="mt-4 text-lg text-zinc-300">
        {slot.startTime}の5分前から受付を開始します。今しばらくお待ちください。
      </p>
    </div>
  );
}

function SlotProgressCard({ slot, badge }: { slot: SlotStat; badge: string }) {
  const ratio = slot.capacity > 0 ? Math.min(1, slot.issued / slot.capacity) : 0;
  const isFull = slot.remaining <= 0;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-baseline justify-between">
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-zinc-300">
          {badge}
        </span>
        <span className="text-2xl font-bold">{slot.label}</span>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-lg text-zinc-300">発行 / 定員</span>
        <span className={`text-4xl font-black ${isFull ? "text-red-400" : "text-green-400"}`}>
          {slot.issued} / {slot.capacity}
        </span>
      </div>
      <div className="mt-4 h-6 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all ${isFull ? "bg-red-500" : "bg-green-500"}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-lg text-zinc-300">
        <span>チェックイン {slot.checkedIn}</span>
        <span>{isFull ? "満員" : `残り ${slot.remaining}`}</span>
      </div>
    </div>
  );
}
