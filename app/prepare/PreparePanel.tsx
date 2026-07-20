"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/fetcher";
import { encodeTicketPayload } from "@/lib/payload";

interface SlotOption {
  id: number;
  key: string;
  label: string;
  capacity: number;
  issued: number;
  remaining: number;
}

interface NfcStatus {
  connected: boolean;
  readerName: string;
  mode: "idle" | "issuing" | "identifying";
}

type PrepareState = "idle" | "arming" | "done" | "error";

export default function PreparePanel() {
  const { data: slotsData, mutate: mutateSlots } = useSWR<{ slots: SlotOption[] }>(
    "/api/slots",
    jsonFetcher,
    { refreshInterval: 3000 }
  );
  const { data: nfc } = useSWR<NfcStatus>("/api/nfc", jsonFetcher, {
    refreshInterval: 2000,
  });
  const slots = slotsData?.slots ?? [];

  const [ticketNumber, setTicketNumber] = useState("");
  const [ticketNumberManual, setTicketNumberManual] = useState(false);
  const [slotId, setSlotId] = useState<number | "">("");
  const [manual, setManual] = useState(false);

  const [state, setState] = useState<PrepareState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const abortRef = useRef(false);

  const selectedSlot = slots.find((s) => s.id === slotId);
  // 整理番号を「時間枠のキー」+「連番(定員-残数+1)」から自動算出する。
  // ユーザーが手入力すると(ticketNumberManual=true)その値を優先する。
  const suggestedTicketNumber = selectedSlot
    ? `${selectedSlot.key}-${String(selectedSlot.capacity - selectedSlot.remaining + 1).padStart(2, "0")}`
    : "";
  const effectiveTicketNumber = ticketNumberManual ? ticketNumber : suggestedTicketNumber;
  const preview =
    effectiveTicketNumber && selectedSlot
      ? encodeTicketPayload({ t: effectiveTicketNumber, n: "", s: selectedSlot.key })
      : null;

  function handleSlotChange(value: string) {
    setSlotId(value ? Number(value) : "");
    setTicketNumberManual(false);
    setTicketNumber("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!effectiveTicketNumber.trim() || slotId === "") {
      setMessage("整理番号・時間枠を入力してください。");
      setState("error");
      return;
    }

    abortRef.current = false;
    setState("arming");
    try {
      const res = await fetch("/api/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketNumber: effectiveTicketNumber.trim(),
          slotId,
          manual,
        }),
      });
      const data = await res.json();
      if (abortRef.current) return;
      if (!res.ok || !data.success) {
        setMessage(data.error ?? "準備に失敗しました。");
        setState("error");
        return;
      }
      setMessage(
        `準備しました: ${data.ticket.ticketNumber}${data.uid ? ` (UID: ${data.uid})` : ""}`
      );
      setState("done");
      // 整理番号のみクリアし、時間枠は保持する(同じ枠へ連続して準備しやすくするため)。
      // 手動入力フラグもリセットし、次の連番が自動で提案されるようにする。
      setTicketNumber("");
      setTicketNumberManual(false);
      await mutateSlots();
    } catch {
      if (!abortRef.current) {
        setMessage("通信エラーが発生しました。");
        setState("error");
      }
    }
  }

  async function handleCancel() {
    abortRef.current = true;
    await fetch("/api/prepare", { method: "DELETE" });
    setState("idle");
    setMessage("準備をキャンセルしました。");
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
            : "NFCリーダー未接続（手動準備のみ利用できます）"}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <label className="flex flex-col gap-1 text-sm">
          整理番号
          <input
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-black"
            placeholder="A-001"
            value={effectiveTicketNumber}
            onChange={(e) => {
              setTicketNumber(e.target.value);
              setTicketNumberManual(true);
            }}
            disabled={state === "arming"}
          />
          <span className="text-xs text-zinc-500">
            時間枠を選択すると自動採番されます（編集も可能です）。
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          時間枠
          <select
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-black"
            value={slotId}
            onChange={(e) => handleSlotChange(e.target.value)}
            disabled={state === "arming"}
          >
            <option value="">選択してください</option>
            {slots.map((s) => (
              <option key={s.id} value={s.id} disabled={s.remaining <= 0}>
                {s.label} （残 {s.remaining}/{s.capacity}）
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={manual}
            onChange={(e) => setManual(e.target.checked)}
            disabled={state === "arming"}
          />
          手動準備（NFC書込を行わずレコードのみ作成する。検証用）
        </label>

        {preview && (
          <p className="break-all rounded-md bg-zinc-100 p-2 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            タグ書込プレビュー: {preview}
          </p>
        )}

        {message && (
          <p
            className={`text-sm ${state === "error" ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}
          >
            {message}
          </p>
        )}

        {state === "arming" ? (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">タグをかざしてください…</span>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-full border border-black/15 px-4 py-2 text-sm dark:border-white/15"
            >
              キャンセル
            </button>
          </div>
        ) : (
          <button
            type="submit"
            className="w-fit rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background"
          >
            {manual ? "準備する" : "タグにかざして準備"}
          </button>
        )}
      </form>
    </div>
  );
}
