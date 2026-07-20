"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/fetcher";

type CheckinOutcome = "ok" | "already" | "unknown" | "void" | "not_issued" | "too_early";

interface CheckinResultPayload {
  ticketNumber: string;
  name: string | null;
  slotLabel: string | null;
  slotStartTime: string | null;
  result: CheckinOutcome;
}

// NFC読取結果はタグがかざされている間だけ表示する。手動入力の結果は
// (かざす動作が無いため)入力直後から表示を続ける。
interface DisplayResult extends CheckinResultPayload {
  source: "nfc" | "manual";
}

const POLL_INTERVAL_MS = 1000;

// 統合画面は会場モニタとしても使われるため常時ダーク表示(DisplayBoard時代の方針を踏襲)。
// OSのlight/dark設定に関わらず一定の見た目にするため dark: プレフィックスには頼らない。
const RESULT_STYLE: Record<CheckinOutcome, { label: string; className: string }> = {
  ok: { label: "チェックイン完了", className: "bg-green-950 border-green-700 text-green-200" },
  already: { label: "チェックイン済み", className: "bg-yellow-950 border-yellow-700 text-yellow-200" },
  unknown: { label: "未登録のタグです", className: "bg-red-950 border-red-700 text-red-200" },
  void: { label: "無効化された整理券です", className: "bg-red-950 border-red-700 text-red-200" },
  not_issued: { label: "未発行の整理券です（受付名が未登録）", className: "bg-orange-950 border-orange-700 text-orange-200" },
  too_early: { label: "受付開始前です", className: "bg-blue-950 border-blue-700 text-blue-200" },
};

export default function CheckinPanel() {
  const [latest, setLatest] = useState<DisplayResult | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  // NFC読取イベントのドレイン結果はSWRのonSuccessで受け取る(effect本体で直接setStateしない)。
  const { data } = useSWR<{ connected: boolean; tagPresent: boolean; results: CheckinResultPayload[] }>(
    "/api/checkin",
    jsonFetcher,
    {
      refreshInterval: POLL_INTERVAL_MS,
      onSuccess: (payload) => {
        if (payload.results.length > 0) {
          setLatest({ ...payload.results[payload.results.length - 1], source: "nfc" });
        }
      },
    }
  );
  const connected = data?.connected ?? false;
  const tagPresent = data?.tagPresent ?? false;
  // NFC結果はタグがかざされている間だけ表示。手動入力の結果は常に表示する。
  const showResult = latest !== null && (latest.source === "manual" || tagPresent);

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
        slotStartTime: resData.slot?.startTime ?? null,
        result: resData.result,
        source: "manual",
      });
      setManualInput("");
    } finally {
      setManualBusy(false);
    }
  }

  const style = showResult && latest ? RESULT_STYLE[latest.result] : null;

  return (
    <div className="flex flex-col gap-6">
      {!connected && (
        <div className="rounded-lg border border-yellow-700 bg-yellow-950 px-4 py-3 text-sm text-yellow-200">
          NFCリーダーが接続されていません。下の手動入力で整理番号を入力してチェックインできます。
        </div>
      )}

      <div
        className={`flex min-h-[220px] flex-col items-center justify-center rounded-2xl border-2 p-8 text-center transition-colors ${
          style ? style.className : "border-white/10 bg-white/5"
        }`}
      >
        {showResult && latest ? (
          <>
            <p className="text-2xl font-bold">{style?.label}</p>
            <p className="mt-3 text-4xl font-black tracking-tight">{latest.ticketNumber}</p>
            {latest.name && <p className="mt-2 text-xl">{latest.name} 様</p>}
            {latest.slotLabel && <p className="mt-1 text-lg text-zinc-400">{latest.slotLabel}</p>}
            {latest.result === "too_early" && latest.slotStartTime && (
              <p className="mt-2 text-base">
                {latest.slotStartTime}の5分前から受付できます。今しばらくお待ちください。
              </p>
            )}
          </>
        ) : (
          <p className="text-lg text-zinc-400">タグをかざしてください</p>
        )}
      </div>

      <form onSubmit={handleManualCheckin} className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-white/15 bg-black px-3 py-2 text-sm text-white"
          placeholder="整理番号を手動入力（例: A-001）"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={manualBusy}
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          手動チェックイン
        </button>
      </form>
    </div>
  );
}
