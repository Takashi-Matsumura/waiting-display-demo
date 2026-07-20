"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/fetcher";
import CheckinPanel from "./CheckinPanel";
import CurrentNextBoard from "./CurrentNextBoard";
import IssuanceStatus from "./IssuanceStatus";

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

interface StatsResponse {
  slots: SlotStat[];
  totals: Totals;
  current: SlotStat | null;
  next: SlotStat | null;
  announcement: string;
}

const POLL_INTERVAL_MS = 2500;

/**
 * 「受付/チェックイン」と「ディスプレイ(受付状況)」を統合した画面。
 * 領域A: NFCタップ/手動チェックイン + 現在開催中/次の開催
 * 領域B: 全体の整理券発行状況(合計・全枠一覧・お知らせ)
 */
export default function CheckinScreen() {
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const { data } = useSWR<StatsResponse>("/api/stats", jsonFetcher, {
    refreshInterval: POLL_INTERVAL_MS,
    onSuccess: () => setUpdatedAt(new Date()),
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8 lg:px-8">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← ホームに戻る
          </Link>
          <h1 className="mt-2 text-3xl font-black tracking-tight">受付</h1>
        </div>
        {updatedAt && (
          <span className="text-sm text-zinc-500">
            最終更新 {updatedAt.toLocaleTimeString("ja-JP")}
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:divide-x lg:divide-white/10">
        <div className="flex flex-col gap-6">
          <CheckinPanel />
          <CurrentNextBoard
            current={data?.current ?? null}
            next={data?.next ?? null}
            totals={data?.totals ?? null}
          />
        </div>
        <div className="lg:pl-8">
          <IssuanceStatus
            slots={data?.slots ?? []}
            totals={data?.totals ?? null}
            announcement={data?.announcement ?? ""}
          />
        </div>
      </div>
    </div>
  );
}
