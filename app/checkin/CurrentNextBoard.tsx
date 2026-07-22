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
    <div className="flex shrink-0 flex-col gap-4 2xl:gap-4">
      {current ? (
        <SlotProgressCard slot={current} badge="現在開催中" />
      ) : (
        <div className="glass-card rounded-2xl p-6 text-center text-zinc-400 2xl:p-6 2xl:text-xl">
          現在受付中の枠はありません
        </div>
      )}

      {allIssued ? (
        <div className="glass-card rounded-2xl p-6 text-center text-zinc-400 2xl:p-6 2xl:text-xl">
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
    <div className="glass-card rounded-2xl p-6 2xl:p-6">
      <div className="flex items-baseline justify-between">
        <span className="rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-medium text-indigo-300 ring-1 ring-inset ring-indigo-400/25 2xl:px-4 2xl:py-1 2xl:text-sm">
          {badge}
        </span>
        <span className="text-2xl font-bold 2xl:text-4xl">{slot.label}</span>
      </div>
      <p className="mt-4 text-lg text-zinc-300 2xl:mt-3 2xl:text-xl">
        {slot.startTime}の5分前から受付を開始します。今しばらくお待ちください。
      </p>
    </div>
  );
}

function SlotProgressCard({ slot, badge }: { slot: SlotStat; badge: string }) {
  const ratio = slot.capacity > 0 ? Math.min(1, slot.issued / slot.capacity) : 0;
  const isFull = slot.remaining <= 0;
  return (
    <div className="glass-card rounded-2xl p-6 2xl:p-6">
      <div className="flex items-baseline justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400/15 px-3 py-1 text-xs font-medium text-cyan-300 ring-1 ring-inset ring-cyan-400/30 2xl:px-4 2xl:py-1 2xl:text-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]" />
          {badge}
        </span>
        <span className="text-2xl font-bold 2xl:text-4xl">{slot.label}</span>
      </div>
      <div className="mt-3 flex items-baseline justify-between 2xl:mt-3">
        <span className="text-lg text-zinc-300 2xl:text-xl">発行 / 定員</span>
        <span
          className={`text-4xl font-black 2xl:text-6xl ${isFull ? "text-red-400" : "text-emerald-400"}`}
        >
          {slot.issued} / {slot.capacity}
        </span>
      </div>
      <div className="mt-4 h-6 w-full overflow-hidden rounded-full bg-white/10 ring-1 ring-inset ring-white/5 2xl:mt-3 2xl:h-7">
        <div
          className={`h-full rounded-full transition-all ${
            isFull
              ? "bg-gradient-to-r from-red-500 to-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.6)]"
              : "bg-gradient-to-r from-emerald-500 to-green-400 shadow-[0_0_12px_rgba(16,185,129,0.6)]"
          }`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-lg text-zinc-300 2xl:mt-2 2xl:text-xl">
        <span>チェックイン {slot.checkedIn}</span>
        <span>{isFull ? "満員" : `残り ${slot.remaining}`}</span>
      </div>
    </div>
  );
}
