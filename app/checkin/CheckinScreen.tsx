"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/fetcher";
import CheckinPanel from "./CheckinPanel";
import CurrentNextBoard from "./CurrentNextBoard";
import IssuanceStatus from "./IssuanceStatus";
import LunchBreakDisplay from "./LunchBreakDisplay";

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
  isPast?: boolean;
}

interface Totals {
  capacity: number;
  issued: number;
  checkedIn: number;
  remaining: number;
}

interface LunchBreak {
  startTime: string;
  endTime: string;
}

interface StatsResponse {
  slots: SlotStat[];
  totals: Totals;
  current: SlotStat | null;
  next: SlotStat | null;
  announcement: string;
  eventTitle: string;
  lunchBreak: LunchBreak | null;
  isLunchBreakNow: boolean;
  lunchVideo: string;
}

const POLL_INTERVAL_MS = 2500;

/**
 * 「受付/チェックイン」と「ディスプレイ(受付状況)」を統合した画面。
 * 領域A: NFCタップ/手動チェックイン + 現在開催中/次の開催
 * 領域B: 全体の整理券発行状況(合計・全枠一覧・お知らせ)
 *
 * お昼休み表示への切り替えは、実際にお昼休み時間帯(isLunchBreakNow)になった場合の自動切替と、
 * スタッフが発行状況一覧の「お昼休み」パネルをクリックした場合の手動切替の両方に対応する。
 * 両面を同時にDOM上へマウントし、親要素の回転(.flip-card)だけで見た目を切り替えることで、
 * カードをめくるようなアニメーションにしている。
 */
export default function CheckinScreen() {
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [manualLunchMode, setManualLunchMode] = useState(false);
  const { data } = useSWR<StatsResponse>("/api/stats", jsonFetcher, {
    refreshInterval: POLL_INTERVAL_MS,
    onSuccess: () => setUpdatedAt(new Date()),
  });

  const isLunchMode = manualLunchMode || Boolean(data?.isLunchBreakNow && data?.lunchVideo);

  return (
    <div className="flip-container mx-auto min-h-0 w-full max-w-6xl flex-1 2xl:max-w-[1900px]">
      <div className={`flip-card ${isLunchMode ? "is-flipped" : ""}`}>
        <div
          className={`flip-face gap-4 px-6 py-6 lg:px-8 2xl:gap-6 2xl:px-16 2xl:py-8 ${
            isLunchMode ? "pointer-events-none" : ""
          }`}
        >
          <header className="flex shrink-0 items-center justify-between border-b border-white/10 pb-4 2xl:pb-4">
            <div>
              <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300 2xl:text-lg">
                ← ホームに戻る
              </Link>
              <div className="mt-2 flex items-center gap-3">
                <span className="h-8 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-sky-400 to-indigo-500 shadow-[0_0_16px_rgba(56,189,248,0.6)] 2xl:h-10" />
                <h1 className="text-3xl font-black tracking-tight 2xl:text-5xl">
                  {data?.eventTitle ? `${data.eventTitle} ` : ""}受付
                </h1>
              </div>
            </div>
            {updatedAt && (
              <span className="text-sm text-zinc-500 2xl:text-lg">
                最終更新 {updatedAt.toLocaleTimeString("ja-JP")}
              </span>
            )}
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-8 lg:grid-cols-2 lg:divide-x lg:divide-sky-400/10 2xl:gap-12">
            <div className="flex min-h-0 flex-col gap-6 overflow-y-auto">
              <CheckinPanel />
              <CurrentNextBoard
                current={data?.current ?? null}
                next={data?.next ?? null}
                totals={data?.totals ?? null}
                lunchBreak={data?.lunchBreak ?? null}
                isLunchBreakNow={data?.isLunchBreakNow ?? false}
              />
            </div>
            <div className="flex min-h-0 flex-col lg:pl-8 2xl:pl-12">
              <IssuanceStatus
                slots={data?.slots ?? []}
                totals={data?.totals ?? null}
                announcement={data?.announcement ?? ""}
                lunchBreak={data?.lunchBreak ?? null}
                onLunchBreakClick={() => setManualLunchMode(true)}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setManualLunchMode(false)}
          aria-label="タップして受付表示に戻る"
          className={`flip-face flip-face-back cursor-pointer px-6 py-6 text-left lg:px-8 2xl:px-16 2xl:py-8 ${
            isLunchMode ? "" : "pointer-events-none"
          }`}
        >
          <LunchBreakDisplay
            lunchBreak={data?.lunchBreak ?? null}
            videoSrc={data?.lunchVideo ?? ""}
            eventTitle={data?.eventTitle}
          />
        </button>
      </div>
    </div>
  );
}
