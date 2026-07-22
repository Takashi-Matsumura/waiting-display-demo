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
 * 全体の整理券発行状況(合計＋全枠一覧)を表示する。全券が発行され残数が無くなった
 * 場合は、/setup で設定された案内コメント(announcement)をここに表示する。
 */
export default function IssuanceStatus({
  slots,
  totals,
  announcement,
}: {
  slots: SlotStat[];
  totals: Totals | null;
  announcement: string;
}) {
  const soldOut = totals !== null && totals.remaining <= 0 && totals.capacity > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 2xl:gap-4">
      {totals && (
        <div className="grid shrink-0 grid-cols-3 gap-4 2xl:gap-4">
          <TotalCard label="発行数" value={totals.issued} />
          <TotalCard label="チェックイン数" value={totals.checkedIn} />
          <TotalCard label="残数" value={totals.remaining} />
        </div>
      )}

      {soldOut && announcement && (
        <div className="shrink-0 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-6 text-center text-lg text-amber-200 whitespace-pre-wrap backdrop-blur-xl shadow-[0_0_50px_-18px_rgba(245,158,11,0.4)] 2xl:p-6 2xl:text-2xl">
          {announcement}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1 2xl:gap-2">
        {slots.length === 0 && (
          <p className="text-zinc-400 2xl:text-xl">時間枠が登録されていません。</p>
        )}
        {slots.map((slot) => {
          const isFull = slot.remaining <= 0;
          return (
            <div
              key={slot.id}
              className="glass-card flex shrink-0 items-center justify-between rounded-lg px-4 py-2 text-sm 2xl:px-6 2xl:py-3 2xl:text-xl"
            >
              <span className="font-medium">{slot.label}</span>
              <span className={isFull ? "text-red-400" : "text-zinc-300"}>
                {slot.issued} / {slot.capacity}
                {isFull ? "（満員）" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TotalCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card rounded-2xl p-4 text-center 2xl:p-5">
      <p className="text-sm text-zinc-400 2xl:text-lg">{label}</p>
      <p className="mt-1 text-3xl font-black text-white drop-shadow-[0_0_20px_rgba(56,189,248,0.35)] 2xl:mt-2 2xl:text-5xl">
        {value}
      </p>
    </div>
  );
}
