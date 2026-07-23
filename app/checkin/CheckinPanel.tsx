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
// 各結果は半透明の背景+ボーダーに、同系色のグロー(box-shadow)を重ねてダークネイビー背景に馴染ませる。
const RESULT_STYLE: Record<CheckinOutcome, { label: string; className: string }> = {
  ok: {
    label: "チェックイン完了",
    className:
      "border-emerald-500/60 bg-emerald-950/70 text-emerald-200 shadow-[0_0_70px_-15px_rgba(16,185,129,0.55)]",
  },
  already: {
    label: "チェックイン済み",
    className:
      "border-amber-500/60 bg-amber-950/70 text-amber-200 shadow-[0_0_70px_-15px_rgba(245,158,11,0.5)]",
  },
  unknown: {
    label: "未登録のタグです",
    className:
      "border-rose-500/60 bg-rose-950/70 text-rose-200 shadow-[0_0_70px_-15px_rgba(244,63,94,0.5)]",
  },
  void: {
    label: "無効化された整理券です",
    className:
      "border-rose-500/60 bg-rose-950/70 text-rose-200 shadow-[0_0_70px_-15px_rgba(244,63,94,0.5)]",
  },
  not_issued: {
    label: "未発行の整理券です（受付名が未登録）",
    className:
      "border-orange-500/60 bg-orange-950/70 text-orange-200 shadow-[0_0_70px_-15px_rgba(249,115,22,0.5)]",
  },
  too_early: {
    label: "受付開始前です",
    className:
      "border-sky-500/60 bg-sky-950/70 text-sky-200 shadow-[0_0_70px_-15px_rgba(14,165,233,0.5)]",
  },
};

export default function CheckinPanel() {
  const [latest, setLatest] = useState<DisplayResult | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualVisible, setManualVisible] = useState(false);

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
  // 手動チェックインは緊急時の代替手段のため通常は隠す。NFCリーダー未接続時は
  // 唯一のチェックイン手段になるため自動的に表示する。
  const showManualForm = manualVisible || !connected;

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
  // 未接続時は装飾なし、接続済み・待受中は「タップを誘う」淡いシアンのグローを添える。
  const idleClassName = connected
    ? "border-cyan-400/25 bg-cyan-400/[0.04] shadow-[0_0_70px_-22px_rgba(34,211,238,0.45)]"
    : "border-white/10 bg-white/[0.03]";

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 2xl:gap-4">
      <div
        className={`relative flex flex-1 min-h-[220px] flex-col items-center justify-center rounded-2xl border-2 p-8 text-center backdrop-blur-xl transition-all duration-500 2xl:min-h-[260px] 2xl:p-8 ${
          style ? style.className : idleClassName
        }`}
      >
        {!connected && (
          <span
            className="absolute right-3 top-3 text-yellow-500 2xl:right-4 2xl:top-4"
            title="NFCリーダーが接続されていません。下の手動入力で整理番号を入力してチェックインできます。"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6 2xl:h-8 2xl:w-8"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </span>
        )}
        {showResult && latest ? (
          <>
            <p className="text-2xl font-bold 2xl:text-4xl">{style?.label}</p>
            <p className="mt-3 text-4xl font-black tracking-tight 2xl:mt-4 2xl:text-7xl">
              {latest.ticketNumber}
            </p>
            {latest.name && <p className="mt-2 text-xl 2xl:mt-3 2xl:text-3xl">{latest.name} 様</p>}
            {latest.slotLabel && (
              <p className="mt-1 text-lg text-zinc-400 2xl:mt-1 2xl:text-2xl">{latest.slotLabel}</p>
            )}
            {latest.result === "too_early" && latest.slotStartTime && (
              <p className="mt-2 text-base 2xl:mt-3 2xl:text-xl">
                {latest.slotStartTime}の5分前から受付できます。今しばらくお待ちください。
              </p>
            )}
          </>
        ) : (
          <p className="text-lg text-zinc-400 2xl:text-3xl">タグをかざしてください</p>
        )}
      </div>

      {showManualForm ? (
        <form onSubmit={handleManualCheckin} className="flex shrink-0 gap-2 2xl:gap-3">
          <input
            className="flex-1 rounded-md border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-sky-400/50 focus:outline-none 2xl:px-4 2xl:py-3 2xl:text-base"
            placeholder="整理番号を手動入力（例: A-001）"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={manualBusy}
            className="rounded-full bg-gradient-to-b from-white to-slate-200 px-4 py-2 text-sm font-medium text-slate-950 shadow-[0_0_20px_-6px_rgba(255,255,255,0.35)] disabled:opacity-50 2xl:px-6 2xl:py-3 2xl:text-base"
          >
            手動チェックイン
          </button>
          {connected && (
            <button
              type="button"
              onClick={() => setManualVisible(false)}
              className="shrink-0 rounded-full px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 2xl:text-sm"
            >
              閉じる
            </button>
          )}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setManualVisible(true)}
          className="shrink-0 self-start text-xs text-zinc-600 hover:text-zinc-400 2xl:text-sm"
        >
          手動チェックインを表示（緊急時）
        </button>
      )}
    </div>
  );
}
