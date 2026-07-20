"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/fetcher";

type CheckinOutcome = "ok" | "already" | "unknown" | "void";

interface CheckinResultPayload {
  ticketNumber: string;
  name: string | null;
  slotLabel: string | null;
  result: CheckinOutcome;
}

const POLL_INTERVAL_MS = 1000;

const RESULT_STYLE: Record<CheckinOutcome, { label: string; className: string }> = {
  ok: { label: "チェックイン完了", className: "bg-green-100 border-green-400 text-green-900 dark:bg-green-950 dark:border-green-700 dark:text-green-200" },
  already: { label: "チェックイン済み（二重）", className: "bg-yellow-100 border-yellow-400 text-yellow-900 dark:bg-yellow-950 dark:border-yellow-700 dark:text-yellow-200" },
  unknown: { label: "未登録のタグです", className: "bg-red-100 border-red-400 text-red-900 dark:bg-red-950 dark:border-red-700 dark:text-red-200" },
  void: { label: "無効化された整理券です", className: "bg-red-100 border-red-400 text-red-900 dark:bg-red-950 dark:border-red-700 dark:text-red-200" },
};

export default function CheckinPanel() {
  const [latest, setLatest] = useState<CheckinResultPayload | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  // NFC読取イベントのドレイン結果はSWRのonSuccessで受け取る(effect本体で直接setStateしない)。
  const { data } = useSWR<{ connected: boolean; results: CheckinResultPayload[] }>(
    "/api/checkin",
    jsonFetcher,
    {
      refreshInterval: POLL_INTERVAL_MS,
      onSuccess: (payload) => {
        if (payload.results.length > 0) {
          setLatest(payload.results[payload.results.length - 1]);
        }
      },
    }
  );
  const connected = data?.connected ?? false;

  async function handleManualCheckin(e: React.FormEvent) {
    e.preventDefault();
    if (!manualInput.trim()) return;
    setManualBusy(true);
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketNumber: manualInput.trim() }),
      });
      const resData = await res.json();
      setLatest({
        ticketNumber: manualInput.trim(),
        name: resData.ticket?.name ?? null,
        slotLabel: resData.slot?.label ?? null,
        result: resData.result,
      });
      setManualInput("");
    } finally {
      setManualBusy(false);
    }
  }

  const style = latest ? RESULT_STYLE[latest.result] : null;

  return (
    <div className="flex flex-col gap-6">
      {!connected && (
        <div className="rounded-lg border border-yellow-400 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">
          NFCリーダーが接続されていません。下の手動入力で整理番号を入力してチェックインできます。
        </div>
      )}

      <div
        className={`flex min-h-[220px] flex-col items-center justify-center rounded-2xl border-2 p-8 text-center transition-colors ${
          style ? style.className : "border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900"
        }`}
      >
        {latest ? (
          <>
            <p className="text-2xl font-bold">{style?.label}</p>
            <p className="mt-3 text-4xl font-black tracking-tight">{latest.ticketNumber}</p>
            {latest.name && <p className="mt-2 text-xl">{latest.name} 様</p>}
            {latest.slotLabel && (
              <p className="mt-1 text-lg text-zinc-600 dark:text-zinc-400">{latest.slotLabel}</p>
            )}
          </>
        ) : (
          <p className="text-lg text-zinc-500">タグをかざしてください</p>
        )}
      </div>

      <form onSubmit={handleManualCheckin} className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
          placeholder="整理番号を手動入力（例: A-001）"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={manualBusy}
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          手動チェックイン
        </button>
      </form>
    </div>
  );
}
