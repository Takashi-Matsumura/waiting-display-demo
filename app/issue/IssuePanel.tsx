"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/fetcher";

interface NfcStatus {
  connected: boolean;
  readerName: string;
  mode: "idle" | "issuing" | "identifying";
}

interface Identified {
  ticketNumber: string;
  slotLabel: string | null;
  uid: string | null;
  alreadyIssued: boolean;
  existingName: string | null;
}

type Phase = "idle" | "identifying" | "identified" | "completing";

export default function IssuePanel() {
  const { data: nfc } = useSWR<NfcStatus>("/api/nfc", jsonFetcher, {
    refreshInterval: 2000,
  });

  const [phase, setPhase] = useState<Phase>("idle");
  const [manual, setManual] = useState(false);
  const [manualTicketNumber, setManualTicketNumber] = useState("");
  const [identified, setIdentified] = useState<Identified | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const abortRef = useRef(false);

  async function handleIdentify(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (manual && !manualTicketNumber.trim()) {
      setMessage("整理番号を入力してください。");
      setMessageIsError(true);
      return;
    }

    abortRef.current = false;
    setPhase("identifying");
    try {
      const res = await fetch("/api/issue/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          manual ? { manual: true, ticketNumber: manualTicketNumber.trim() } : {}
        ),
      });
      const data = await res.json();
      if (abortRef.current) return;
      if (!res.ok || !data.success) {
        setMessage(data.error ?? "識別に失敗しました。");
        setMessageIsError(true);
        setPhase("idle");
        return;
      }
      setIdentified({
        ticketNumber: data.ticketNumber,
        slotLabel: data.slotLabel,
        uid: data.uid,
        alreadyIssued: data.alreadyIssued,
        existingName: data.existingName,
      });
      setName(data.existingName ?? "");
      if (data.alreadyIssued) {
        setMessage(`この整理券には既に受付名「${data.existingName}」が登録済みです。上書きできます。`);
        setMessageIsError(false);
      }
      setPhase("identified");
    } catch {
      if (!abortRef.current) {
        setMessage("通信エラーが発生しました。");
        setMessageIsError(true);
        setPhase("idle");
      }
    }
  }

  async function handleCancelIdentify() {
    abortRef.current = true;
    await fetch("/api/issue/identify", { method: "DELETE" });
    setPhase("idle");
    setMessage("識別をキャンセルしました。");
    setMessageIsError(false);
  }

  function handleBack() {
    setIdentified(null);
    setName("");
    setMessage(null);
    setPhase("idle");
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    if (!identified) return;
    setMessage(null);
    if (!name.trim()) {
      setMessage("受付名を入力してください。");
      setMessageIsError(true);
      return;
    }

    abortRef.current = false;
    setPhase("completing");
    try {
      const res = await fetch("/api/issue/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketNumber: identified.ticketNumber,
          name: name.trim(),
          expectedUid: identified.uid ?? undefined,
          manual,
        }),
      });
      const data = await res.json();
      if (abortRef.current) return;
      if (!res.ok || !data.success) {
        setMessage(data.error ?? "発行に失敗しました。");
        setMessageIsError(true);
        setPhase("identified");
        return;
      }
      setMessage(
        `発行しました: ${identified.ticketNumber} / ${name.trim()}${data.wasNamed ? "（上書きしました）" : ""}`
      );
      setMessageIsError(false);
      setIdentified(null);
      setName("");
      setManualTicketNumber("");
      setPhase("idle");
    } catch {
      if (!abortRef.current) {
        setMessage("通信エラーが発生しました。");
        setMessageIsError(true);
        setPhase("identified");
      }
    }
  }

  async function handleCancelComplete() {
    abortRef.current = true;
    await fetch("/api/issue/complete", { method: "DELETE" });
    setPhase("identified");
    setMessage("書込をキャンセルしました。");
    setMessageIsError(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-zinc-900">
        <span
          className={`h-2.5 w-2.5 rounded-full ${nfc?.connected ? "bg-green-500" : "bg-zinc-400"}`}
        />
        {nfc === undefined
          ? "リーダー状態を確認中…"
          : nfc.connected
            ? `NFCリーダー接続中: ${nfc.readerName}`
            : "NFCリーダー未接続（手動発行のみ利用できます）"}
      </div>

      {(phase === "idle" || phase === "identifying") && (
        <form
          onSubmit={handleIdentify}
          className="flex flex-col gap-4 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900"
        >
          <h2 className="text-lg font-semibold">ステップ1: タグを識別</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={manual}
              onChange={(e) => setManual(e.target.checked)}
              disabled={phase === "identifying"}
            />
            手動照会（NFC読取を行わず整理番号を直接入力する。検証用）
          </label>
          {manual && (
            <label className="flex flex-col gap-1 text-sm">
              整理番号
              <input
                className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-black"
                placeholder="A-001"
                value={manualTicketNumber}
                onChange={(e) => setManualTicketNumber(e.target.value)}
                disabled={phase === "identifying"}
              />
            </label>
          )}

          {message && (
            <p className={`text-sm ${messageIsError ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
              {message}
            </p>
          )}

          {phase === "identifying" && !manual ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">タグをかざしてください…</span>
              <button
                type="button"
                onClick={handleCancelIdentify}
                className="rounded-full border border-black/15 px-4 py-2 text-sm dark:border-white/15"
              >
                キャンセル
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={phase === "identifying"}
              className="w-fit rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {manual ? "照会する" : "タグを読み取る"}
            </button>
          )}
        </form>
      )}

      {(phase === "identified" || phase === "completing") && identified && (
        <form
          onSubmit={handleComplete}
          className="flex flex-col gap-4 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900"
        >
          <h2 className="text-lg font-semibold">ステップ2: 受付名を入力して発行</h2>
          <div className="rounded-md bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
            <p>
              整理番号: <span className="font-semibold">{identified.ticketNumber}</span>
            </p>
            <p>
              時間枠: <span className="font-semibold">{identified.slotLabel ?? "-"}</span>
            </p>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            受付名
            <input
              className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-black"
              placeholder="山田太郎"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={phase === "completing"}
            />
          </label>

          {message && (
            <p className={`text-sm ${messageIsError ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
              {message}
            </p>
          )}

          {phase === "completing" && !manual ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">もう一度同じタグをかざしてください…</span>
              <button
                type="button"
                onClick={handleCancelComplete}
                className="rounded-full border border-black/15 px-4 py-2 text-sm dark:border-white/15"
              >
                キャンセル
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={phase === "completing"}
                className="w-fit rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
              >
                {manual ? "発行する" : "書き込んで発行"}
              </button>
              <button
                type="button"
                onClick={handleBack}
                disabled={phase === "completing"}
                className="w-fit rounded-full border border-black/15 px-5 py-2 text-sm dark:border-white/15"
              >
                戻る
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
