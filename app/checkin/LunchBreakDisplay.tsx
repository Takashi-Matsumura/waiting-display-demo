interface LunchBreak {
  startTime: string;
  endTime: string;
}

/**
 * お昼休み中の全画面表示。ブースで開催しているプログラムの紹介動画をループ再生しつつ、
 * 「ただいまお昼休み中」であることと受付再開時刻を案内する。
 *
 * - videoSrc が設定されていれば、public/ に置いた動画ファイル(例: "/lunch-movie.mp4")や
 *   外部URLを主役として全画面表示する(autoPlay のため muted 必須)。
 * - videoSrc が空欄の場合はテキスト案内のみのフォールバック表示にする。
 */
export default function LunchBreakDisplay({
  lunchBreak,
  videoSrc,
  eventTitle,
}: {
  lunchBreak: LunchBreak | null;
  videoSrc: string;
  eventTitle?: string;
}) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] justify-items-center gap-6 overflow-hidden text-center 2xl:gap-8">
      <div className="flex flex-col items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-4 py-1.5 text-sm font-medium text-amber-300 ring-1 ring-inset ring-amber-400/25 2xl:px-5 2xl:py-2 2xl:text-lg">
          お昼休み
        </span>
        <h1 className="text-3xl font-black tracking-tight 2xl:text-5xl">
          {eventTitle ? `${eventTitle} ` : ""}ただいまお昼休み中です
        </h1>
        {lunchBreak && (
          <p className="text-lg text-zinc-300 2xl:text-2xl">
            {lunchBreak.startTime}〜{lunchBreak.endTime}（{lunchBreak.endTime}から受付を再開します）
          </p>
        )}
      </div>

      {videoSrc ? (
        <div className="glass-card h-full min-h-0 w-full overflow-hidden rounded-2xl p-2">
          <video
            key={videoSrc}
            src={videoSrc}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full rounded-xl object-contain"
          />
        </div>
      ) : (
        <div className="glass-card flex w-full max-w-2xl flex-col gap-2 rounded-2xl p-8 text-zinc-300 2xl:max-w-3xl 2xl:p-10 2xl:text-xl">
          <p>ブースの紹介動画は準備中です。</p>
        </div>
      )}
    </div>
  );
}
