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
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-bold tracking-tight">整理券発行</h2>

      {totals && (
        <div className="grid grid-cols-3 gap-4">
          <TotalCard label="発行数" value={totals.issued} />
          <TotalCard label="チェックイン数" value={totals.checkedIn} />
          <TotalCard label="残数" value={totals.remaining} />
        </div>
      )}

      {soldOut && announcement && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-6 text-center text-lg text-amber-200 whitespace-pre-wrap">
          {announcement}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {slots.length === 0 && (
          <p className="text-zinc-400">時間枠が登録されていません。</p>
        )}
        {slots.map((slot) => {
          const isFull = slot.remaining <= 0;
          return (
            <div
              key={slot.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm"
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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
    </div>
  );
}
