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
  mode: "idle" | "issuing";
}

type IssueState = "idle" | "arming" | "done" | "error";

export default function IssuePanel() {
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
  const [name, setName] = useState("");
  const [slotId, setSlotId] = useState<number | "">("");
  const [manual, setManual] = useState(false);

  const [state, setState] = useState<IssueState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const abortRef = useRef(false);

  const selectedSlot = slots.find((s) => s.id === slotId);
  const preview =
    ticketNumber && name && selectedSlot
      ? encodeTicketPayload({ t: ticketNumber, n: name, s: selectedSlot.key })
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!ticketNumber.trim() || !name.trim() || slotId === "") {
      setMessage("整理番号・受付名・時間枠をすべて入力してください。");
      setState("error");
      return;
    }

    abortRef.current = false;
    setState("arming");
    try {
      const res = await fetch("/api/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketNumber: ticketNumber.trim(),
          name: name.trim(),
          slotId,
          manual,
        }),
      });
      const data = await res.json();
      if (abortRef.current) return;
      if (!res.ok || !data.success) {
        setMessage(data.error ?? "発行に失敗しました。");
        setState("error");
        return;
      }
      setMessage(
        `発行しました: ${data.ticket.ticketNumber} / ${data.ticket.name}${
          data.uid ? ` (UID: ${data.uid})` : ""
        }`
      );
      setState("done");
      setTicketNumber("");
      setName("");
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
    await fetch("/api/issue", { method: "DELETE" });
    setState("idle");
    setMessage("発行をキャンセルしました。");
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

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <label className="flex flex-col gap-1 text-sm">
          整理番号
          <input
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-black"
            placeholder="A-001"
            value={ticketNumber}
            onChange={(e) => setTicketNumber(e.target.value)}
            disabled={state === "arming"}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          受付名
          <input
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-black"
            placeholder="山田太郎"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={state === "arming"}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          時間枠
          <select
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-black"
            value={slotId}
            onChange={(e) => setSlotId(e.target.value ? Number(e.target.value) : "")}
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
          手動発行（NFC書込を行わずレコードのみ作成する。検証用）
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
            {manual ? "発行する" : "タグにかざして発行"}
          </button>
        )}
      </form>
    </div>
  );
}
