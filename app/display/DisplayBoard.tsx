"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/fetcher";

interface SlotStat {
  id: number;
  key: string;
  label: string;
  startTime: string | null;
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

const POLL_INTERVAL_MS = 2500;

export default function DisplayBoard() {
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const { data } = useSWR<{ slots: SlotStat[]; totals: Totals }>(
    "/api/stats",
    jsonFetcher,
    {
      refreshInterval: POLL_INTERVAL_MS,
      onSuccess: () => setUpdatedAt(new Date()),
    }
  );
  const slots = data?.slots ?? [];
  const totals = data?.totals ?? null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-8 py-10">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
            ← ホームに戻る
          </Link>
          <h1 className="mt-2 text-4xl font-black tracking-tight">受付状況</h1>
        </div>
        {updatedAt && (
          <span className="text-sm text-zinc-400">
            最終更新 {updatedAt.toLocaleTimeString("ja-JP")}
          </span>
        )}
      </header>

      {totals && (
        <div className="grid grid-cols-3 gap-6">
          <TotalCard label="発行数" value={totals.issued} />
          <TotalCard label="チェックイン数" value={totals.checkedIn} />
          <TotalCard label="残数" value={totals.remaining} />
        </div>
      )}

      <div className="flex flex-col gap-6">
        {slots.length === 0 && (
          <p className="text-2xl text-zinc-400">時間枠が登録されていません。</p>
        )}
        {slots.map((slot) => {
          const ratio = slot.capacity > 0 ? Math.min(1, slot.issued / slot.capacity) : 0;
          const isFull = slot.remaining <= 0;
          return (
            <div
              key={slot.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-6"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{slot.label}</span>
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
        })}
      </div>
    </div>
  );
}

function TotalCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
      <p className="text-lg text-zinc-400">{label}</p>
      <p className="mt-2 text-5xl font-black">{value}</p>
    </div>
  );
}
