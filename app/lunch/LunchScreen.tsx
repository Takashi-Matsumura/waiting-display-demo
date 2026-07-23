"use client";

import Link from "next/link";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/fetcher";
import LunchBreakDisplay from "../checkin/LunchBreakDisplay";

interface LunchBreak {
  startTime: string;
  endTime: string;
}

interface StatsResponse {
  eventTitle: string;
  lunchBreak: LunchBreak | null;
  lunchVideo: string;
}

const POLL_INTERVAL_MS = 2500;

/**
 * 「お昼休み表示」専用画面。ブース紹介動画の全画面ループ再生と、お昼休みの案内を表示する。
 * /checkin からの自動切替とは別に、独立URLとして手動で開いたりプレビューしたりできる。
 * このため、実際に今がお昼休み時間帯かどうかに関わらず常にこの表示を行う。
 */
export default function LunchScreen() {
  const { data } = useSWR<StatsResponse>("/api/stats", jsonFetcher, {
    refreshInterval: POLL_INTERVAL_MS,
  });

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-1 flex-col gap-4 px-6 py-6 lg:px-8 2xl:max-w-[1900px] 2xl:gap-6 2xl:px-16 2xl:py-8">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 pb-4 2xl:pb-4">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300 2xl:text-lg">
          ← ホームに戻る
        </Link>
      </header>

      <LunchBreakDisplay
        lunchBreak={data?.lunchBreak ?? null}
        videoSrc={data?.lunchVideo ?? ""}
        eventTitle={data?.eventTitle}
      />
    </div>
  );
}
