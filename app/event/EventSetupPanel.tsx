"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { jsonFetcher } from "@/lib/fetcher";
import { encodeTicketPayload } from "@/lib/payload";
import NfcStatusBar from "@/app/components/NfcStatusBar";
import { useNfcStatus } from "@/app/hooks/useNfcStatus";
import { formatTimeRange, useSlots, type SlotStat } from "@/app/hooks/useSlots";

interface TicketDetail {
  ticketNumber: string;
  name: string | null;
  status: "issued" | "checked_in" | "void";
  reissuedAt: number | null;
}

interface PrepareResult {
  slotId: number;
  text: string;
  kind: "ok" | "error" | "info";
}

export default function EventSetupPanel({
  onBusyChange,
}: {
  onBusyChange?: (busy: boolean) => void;
}) {
  const { data, mutate, isLoading } = useSlots();
  const { data: nfc } = useNfcStatus();
  const slots = data?.slots ?? [];

  // ---- 時間枠の追加フォーム ----
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [capacity, setCapacity] = useState("10");

  // ---- 行内編集 ----
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCapacity, setEditCapacity] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");

  // ---- NTAG準備(書込) ----
  // activeSlotId が非nullの間、その行がNFCタグの書込待ち(arming)状態。
  // NFCリーダーは同時に1枚しか扱えないため、排他制御のトークンとして使う。
  const [activeSlotId, setActiveSlotId] = useState<number | null>(null);
  const [resultMessage, setResultMessage] = useState<PrepareResult | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const abortRef = useRef(false);

  // ---- 紛失タグの再発行 ----
  // activeReissueNumber が非nullの間、その整理番号がNFCタグの書込待ち状態。
  // 「準備」と同じNFCリーダーを共有するため、isBusy に合流させて相互排他にする。
  const [activeReissueNumber, setActiveReissueNumber] = useState<string | null>(null);
  const [armingReissue, setArmingReissue] = useState<{
    slotId: number;
    slotKey: string;
    ticketNumber: string;
    name: string | null;
  } | null>(null);
  const [expandedSlotId, setExpandedSlotId] = useState<number | null>(null);
  const { mutate: globalMutate } = useSWRConfig();

  // ---- 全ての予約(整理券)のリセット ----
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const isBusy = activeSlotId !== null || activeReissueNumber !== null;

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const capacityNum = Number(capacity);
    if (!key.trim() || !label.trim() || !Number.isInteger(capacityNum) || capacityNum <= 0) {
      setFormError("キー・表示名・定員(正の整数)を入力してください。");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: key.trim(),
          label: label.trim(),
          capacity: capacityNum,
          startTime: startTime.trim() || undefined,
          endTime: endTime.trim() || undefined,
        }),
      });
      const resData = await res.json();
      if (!res.ok) {
        setFormError(resData.error ?? "作成に失敗しました。");
        return;
      }
      setKey("");
      setLabel("");
      setStartTime("");
      setEndTime("");
      setCapacity("10");
      await mutate();
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(slot: SlotStat) {
    setEditingId(slot.id);
    setEditCapacity(String(slot.capacity));
    setEditLabel(slot.label);
    setEditStartTime(slot.startTime ?? "");
    setEditEndTime(slot.endTime ?? "");
  }

  async function saveEdit(id: number) {
    const capacityNum = Number(editCapacity);
    if (!Number.isInteger(capacityNum) || capacityNum <= 0) return;
    await fetch(`/api/slots/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: editLabel.trim(),
        capacity: capacityNum,
        startTime: editStartTime.trim() || null,
        endTime: editEndTime.trim() || null,
      }),
    });
    setEditingId(null);
    await mutate();
  }

  async function handleDelete(id: number, label: string) {
    if (!window.confirm(`時間枠「${label}」を削除します。この操作は取り消せません。よろしいですか？`)) {
      return;
    }
    const res = await fetch(`/api/slots/${id}`, { method: "DELETE" });
    if (res.ok) {
      await mutate();
    } else {
      const resData = await res.json();
      alert(resData.error ?? "削除に失敗しました。");
    }
  }

  async function handleResetAllTickets() {
    if (
      !window.confirm(
        "全ての時間枠の整理券（予約）を削除します。発行数・チェックイン数は0に戻り、この操作は取り消せません。よろしいですか？"
      )
    ) {
      return;
    }
    setResetting(true);
    setResetMessage(null);
    try {
      const res = await fetch("/api/tickets/reset", { method: "POST" });
      if (!res.ok) {
        const resData = await res.json();
        setResetMessage(resData.error ?? "リセットに失敗しました。");
        return;
      }
      await mutate();
      setResetMessage("全ての予約をリセットしました。");
    } catch {
      setResetMessage("通信エラーが発生しました。");
    } finally {
      setResetting(false);
    }
  }

  async function handlePrepare(slot: SlotStat) {
    if (isBusy || editingId !== null || slot.remaining <= 0) return;
    const ticketNumber = `${slot.key}-${String(slot.capacity - slot.remaining + 1).padStart(2, "0")}`;

    abortRef.current = false;
    setActiveSlotId(slot.id);
    setResultMessage(null);
    try {
      const res = await fetch("/api/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketNumber, slotId: slot.id, manual: manualMode }),
      });
      const resData = await res.json();
      if (abortRef.current) return;
      if (!res.ok || !resData.success) {
        setResultMessage({
          slotId: slot.id,
          text: resData.error ?? "準備に失敗しました。",
          kind: "error",
        });
        setActiveSlotId(null);
        return;
      }
      setResultMessage({
        slotId: slot.id,
        text: `準備しました: ${resData.ticket.ticketNumber}${resData.uid ? ` (UID: ${resData.uid})` : ""}`,
        kind: "ok",
      });
      setActiveSlotId(null);
      await mutate();
    } catch {
      if (!abortRef.current) {
        setResultMessage({ slotId: slot.id, text: "通信エラーが発生しました。", kind: "error" });
        setActiveSlotId(null);
      }
    }
  }

  async function handleCancelPrepare(slotId: number) {
    abortRef.current = true;
    await fetch("/api/prepare", { method: "DELETE" });
    setActiveSlotId(null);
    setResultMessage({ slotId, text: "準備をキャンセルしました。", kind: "info" });
  }

  async function handleReissue(
    slotId: number,
    ticketNumber: string,
    name: string | null,
    slotKey: string
  ) {
    if (isBusy || editingId !== null) return;

    abortRef.current = false;
    setActiveReissueNumber(ticketNumber);
    setArmingReissue({ slotId, slotKey, ticketNumber, name });
    setResultMessage(null);
    try {
      const res = await fetch("/api/prepare/reissue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketNumber, manual: manualMode }),
      });
      const resData = await res.json();
      if (abortRef.current) return;
      if (!res.ok || !resData.success) {
        setResultMessage({
          slotId,
          text: resData.error ?? "再発行に失敗しました。",
          kind: "error",
        });
        setActiveReissueNumber(null);
        setArmingReissue(null);
        return;
      }
      setResultMessage({
        slotId,
        text: `再発行しました: ${resData.ticket.ticketNumber}${resData.uid ? ` (UID: ${resData.uid})` : ""}`,
        kind: "ok",
      });
      setActiveReissueNumber(null);
      setArmingReissue(null);
      await mutate(); // /api/slots (件数は変わらないが念のため)
      await globalMutate(`/api/slots/${slotId}/tickets`);
    } catch {
      if (!abortRef.current) {
        setResultMessage({ slotId, text: "通信エラーが発生しました。", kind: "error" });
        setActiveReissueNumber(null);
        setArmingReissue(null);
      }
    }
  }

  async function handleCancelReissue(slotId: number) {
    abortRef.current = true;
    await fetch("/api/prepare", { method: "DELETE" }); // 汎用キャンセル(何がアームしたかは問わない)
    setActiveReissueNumber(null);
    setArmingReissue(null);
    setResultMessage({ slotId, text: "再発行をキャンセルしました。", kind: "info" });
  }

  const armingSlot = slots.find((s) => s.id === activeSlotId) ?? null;
  const armingSuggested = armingSlot
    ? `${armingSlot.key}-${String(armingSlot.capacity - armingSlot.remaining + 1).padStart(2, "0")}`
    : null;

  return (
    <>
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
      {/* 左: 時間枠 / トークン準備 */}
      <div className="flex flex-col gap-6 lg:col-span-3">
        <h2 className="text-xl font-bold tracking-tight">時間枠・トークン準備</h2>

        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold">登録済みの時間枠</h3>
          {isLoading && <p className="text-sm text-zinc-500">読み込み中…</p>}
          {!isLoading && slots.length === 0 && (
            <p className="text-sm text-zinc-500">まだ時間枠がありません。下のフォームから追加してください。</p>
          )}
          {slots.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900">
              <table className="w-full min-w-max text-left text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-xs text-zinc-500 dark:border-white/10">
                    <th className="px-4 py-3 font-medium">表示名</th>
                    <th className="px-4 py-3 font-medium">キー</th>
                    <th className="px-4 py-3 font-medium">時間</th>
                    <th className="px-4 py-3 font-medium">発行 / 定員</th>
                    <th className="px-4 py-3 font-medium">残</th>
                    <th className="px-4 py-3 font-medium">次番号</th>
                    <th className="px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot) => {
                    const isEditing = editingId === slot.id;
                    const isExpanded = expandedSlotId === slot.id;
                    const suggested =
                      slot.remaining > 0
                        ? `${slot.key}-${String(slot.capacity - slot.remaining + 1).padStart(2, "0")}`
                        : null;
                    const disablePrepare = isBusy || editingId !== null || slot.remaining <= 0;
                    const disableEditBtn = isBusy || (editingId !== null && editingId !== slot.id);
                    const disableDeleteBtn = isBusy || editingId !== null;
                    const rowMessage = resultMessage?.slotId === slot.id ? resultMessage : null;

                    return (
                      <Fragment key={slot.id}>
                        <tr className="border-b border-black/5 last:border-0 dark:border-white/5">
                          {isEditing ? (
                            <>
                              <td className="px-4 py-2">
                                <input
                                  className="w-full rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-black"
                                  value={editLabel}
                                  onChange={(e) => setEditLabel(e.target.value)}
                                />
                              </td>
                              <td className="px-4 py-2 text-zinc-500">{slot.key}</td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="time"
                                    className="w-28 rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-black"
                                    value={editStartTime}
                                    onChange={(e) => setEditStartTime(e.target.value)}
                                  />
                                  〜
                                  <input
                                    type="time"
                                    className="w-28 rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-black"
                                    value={editEndTime}
                                    onChange={(e) => setEditEndTime(e.target.value)}
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-1">
                                  {slot.issued} /{" "}
                                  <input
                                    type="number"
                                    min={1}
                                    className="w-16 rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-black"
                                    value={editCapacity}
                                    onChange={(e) => setEditCapacity(e.target.value)}
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-2">{slot.remaining}</td>
                              <td className="px-4 py-2 text-zinc-500">—</td>
                              <td className="px-4 py-2">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => saveEdit(slot.id)}
                                    className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"
                                  >
                                    保存
                                  </button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    className="rounded-full border border-black/15 px-3 py-1 text-xs dark:border-white/15"
                                  >
                                    キャンセル
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-2 font-medium">{slot.label}</td>
                              <td className="px-4 py-2 text-zinc-500">{slot.key}</td>
                              <td className="px-4 py-2 text-zinc-500">
                                {formatTimeRange(slot.startTime, slot.endTime)}
                              </td>
                              <td className="px-4 py-2">
                                {slot.issued} / {slot.capacity}
                              </td>
                              <td className="px-4 py-2">{slot.remaining}</td>
                              <td className="px-4 py-2 text-zinc-500">{suggested ?? "満員"}</td>
                              <td className="px-4 py-2">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handlePrepare(slot)}
                                    disabled={disablePrepare}
                                    className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-40"
                                  >
                                    準備
                                  </button>
                                  <button
                                    onClick={() => startEdit(slot)}
                                    disabled={disableEditBtn}
                                    className="rounded-full border border-black/15 px-3 py-1 text-xs disabled:opacity-40 dark:border-white/15"
                                  >
                                    編集
                                  </button>
                                  <button
                                    onClick={() => handleDelete(slot.id, slot.label)}
                                    disabled={disableDeleteBtn}
                                    className="rounded-full border border-red-300 px-3 py-1 text-xs text-red-600 disabled:opacity-40 dark:border-red-900 dark:text-red-400"
                                  >
                                    削除
                                  </button>
                                  {slot.issued > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setExpandedSlotId(isExpanded ? null : slot.id)}
                                      disabled={isBusy}
                                      className="rounded-full border border-black/15 px-3 py-1 text-xs disabled:opacity-40 dark:border-white/15"
                                    >
                                      {isExpanded ? "▾" : "▸"} 整理券 {slot.issued}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                        {rowMessage && (
                          <tr className="border-b border-black/5 last:border-0 dark:border-white/5">
                            <td
                              colSpan={7}
                              className={`px-4 pb-3 text-xs ${
                                rowMessage.kind === "error"
                                  ? "text-red-600 dark:text-red-400"
                                  : rowMessage.kind === "ok"
                                    ? "text-green-700 dark:text-green-400"
                                    : "text-zinc-500"
                              }`}
                            >
                              {rowMessage.text}
                            </td>
                          </tr>
                        )}
                        {isExpanded && (
                          <tr className="border-b border-black/5 last:border-0 dark:border-white/5">
                            <td colSpan={7} className="bg-black/[0.02] px-4 py-3 dark:bg-white/[0.02]">
                              <SlotTicketList
                                slotId={slot.id}
                                slotKey={slot.key}
                                isBusy={isBusy}
                                onReissue={handleReissue}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"
        >
          <h3 className="text-sm font-semibold text-zinc-500">新しい時間枠を追加</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <label className="flex flex-col gap-1 text-xs">
              キー
              <input
                className="rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-black"
                placeholder="1400"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              表示名
              <input
                className="rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-black"
                placeholder="14:00〜14:30"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              開始時刻
              <input
                type="time"
                className="rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-black"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              終了時刻
              <input
                type="time"
                className="rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-black"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              定員
              <input
                type="number"
                min={1}
                className="rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-black"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-zinc-500">
              開始時刻を設定すると、統合画面の「現在開催中/次の開催」表示と、開始5分前より早いチェックインの拒否に使われます。未設定の枠は時間制限なしで受付できます。
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="w-fit shrink-0 rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background disabled:opacity-50"
            >
              追加する
            </button>
          </div>
          {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
        </form>
      </div>

      {/* 右: アプリ設定 */}
      <div className="flex flex-col gap-6 lg:col-span-1">
        <h2 className="text-xl font-bold tracking-tight">アプリ設定</h2>

        <EventTitleEditor />

        <div className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
          <h3 className="text-lg font-semibold">NFCリーダー</h3>
          <NfcStatusBar nfc={nfc} />
          {nfc !== undefined && !nfc.connected && (
            <p className="text-xs text-zinc-500">
              「手動準備」を有効にしないと、準備ボタンはタグ書込待ちのまま失敗します。
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={manualMode}
              onChange={(e) => setManualMode(e.target.checked)}
              disabled={isBusy}
            />
            手動準備（NFC書込を行わずレコードのみ作成する。検証用）
          </label>
        </div>

        <AnnouncementEditor />

        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-white p-6 dark:border-red-900/40 dark:bg-zinc-900">
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
            全ての予約をリセット
          </h3>
          <p className="text-xs text-zinc-500">
            全ての時間枠に紐づく整理券（予約）を削除し、発行数・チェックイン数を0に戻します。時間枠自体の設定（表示名・時間・定員）は残ります。この操作は取り消せません。
          </p>
          <button
            type="button"
            onClick={handleResetAllTickets}
            disabled={resetting || isBusy || editingId !== null}
            className="w-fit rounded-full border border-red-300 px-5 py-2 text-sm font-medium text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
          >
            全ての予約をリセット
          </button>
          {resetMessage && (
            <span className="text-sm text-zinc-600 dark:text-zinc-400">{resetMessage}</span>
          )}
        </div>
      </div>
    </div>

    {armingSlot && (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      >
        <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
          <h3 className="text-lg font-semibold">NTAGへの書き込み</h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            時間枠「{armingSlot.label}」の整理番号{" "}
            <span className="font-medium text-foreground">{armingSuggested}</span>{" "}
            を準備します。
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border border-dashed border-black/15 py-8 dark:border-white/15">
            <span className="text-sm font-medium">タグをかざしてください…</span>
            {armingSuggested && (
              <p className="break-all px-4 text-center text-[10px] text-zinc-500">
                {encodeTicketPayload({ t: armingSuggested, n: "", s: armingSlot.key })}
              </p>
            )}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => handleCancelPrepare(armingSlot.id)}
              className="rounded-full border border-black/15 px-4 py-2 text-sm dark:border-white/15"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    )}

    {armingReissue && (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      >
        <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
          <h3 className="text-lg font-semibold">NTAGへの再発行</h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            整理番号{" "}
            <span className="font-medium text-foreground">{armingReissue.ticketNumber}</span>
            {armingReissue.name ? `（${armingReissue.name}）` : ""}
            の物理タグを再発行します。
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border border-dashed border-black/15 py-8 dark:border-white/15">
            <span className="text-sm font-medium">タグをかざしてください…</span>
            <p className="break-all px-4 text-center text-[10px] text-zinc-500">
              {encodeTicketPayload({
                t: armingReissue.ticketNumber,
                n: armingReissue.name ?? "",
                s: armingReissue.slotKey,
              })}
            </p>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => handleCancelReissue(armingReissue.slotId)}
              className="rounded-full border border-black/15 px-4 py-2 text-sm dark:border-white/15"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

/**
 * 枠の展開行に表示する、発行済み整理券の一覧。紛失した物理タグの再発行に使う。
 * 整理番号・受付名はそのまま新タグへ引き継がれ、定員(残数)は消費しない。
 */
function SlotTicketList({
  slotId,
  slotKey,
  isBusy,
  onReissue,
}: {
  slotId: number;
  slotKey: string;
  isBusy: boolean;
  onReissue: (slotId: number, ticketNumber: string, name: string | null, slotKey: string) => void;
}) {
  const { data, isLoading } = useSWR<{ tickets: TicketDetail[] }>(
    `/api/slots/${slotId}/tickets`,
    jsonFetcher
  );
  const tickets = data?.tickets ?? [];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-zinc-500">
        紛失した整理券の物理タグを再発行します。整理番号・受付名はそのまま引き継がれ、定員（残数）は消費しません。
      </p>
      {isLoading && <p className="text-xs text-zinc-500">読み込み中…</p>}
      {!isLoading && tickets.length === 0 && (
        <p className="text-xs text-zinc-500">発行済みの整理券がありません。</p>
      )}
      {tickets.map((t) => {
        const named = t.name != null && t.name !== "";
        const statusLabel =
          t.status === "checked_in"
            ? "チェックイン済み"
            : t.status === "void"
              ? "無効"
              : named
                ? "発行済み"
                : "未発行";

        return (
          <div
            key={t.ticketNumber}
            className="flex items-center justify-between gap-3 rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/10"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">{t.ticketNumber}</span>
              <span className={named ? "" : "text-zinc-400"}>{named ? t.name : "未発行"}</span>
              <span className="text-xs text-zinc-500">{statusLabel}</span>
              {t.reissuedAt !== null && (
                <span
                  className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                  title={`再発行日時: ${new Date(t.reissuedAt).toLocaleString("ja-JP")}`}
                >
                  再発行済み
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onReissue(slotId, t.ticketNumber, t.name, slotKey)}
              disabled={isBusy || t.status === "void"}
              className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-40"
            >
              再発行
            </button>
          </div>
        );
      })}
    </div>
  );
}

interface SettingsResponse {
  announcement: string;
  eventTitle: string;
}

/** 受付ディスプレイの見出し「受付」の前に表示するイベントタイトルの編集セクション。 */
function EventTitleEditor() {
  const { data, mutate } = useSWR<SettingsResponse>("/api/settings", jsonFetcher);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const value = draft ?? data?.eventTitle ?? "";

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventTitle: value }),
      });
      await mutate();
      setDraft(null);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
      <h3 className="text-lg font-semibold">イベントタイトル</h3>
      <p className="text-xs text-zinc-500">
        受付ディスプレイの見出し「受付」の前に表示するイベント名です。空欄なら何も表示しません。
      </p>
      <input
        type="text"
        className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
        placeholder="例: 〇〇祭 2026"
        value={value}
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-fit rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          保存
        </button>
        {saved && <span className="text-sm text-green-700 dark:text-green-400">保存しました</span>}
      </div>
    </div>
  );
}

/** 全整理券発行済み時に統合画面へ表示する案内コメントの編集セクション。 */
function AnnouncementEditor() {
  const { data, mutate } = useSWR<SettingsResponse>("/api/settings", jsonFetcher);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const value = draft ?? data?.announcement ?? "";

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ announcement: value }),
      });
      await mutate();
      setDraft(null);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">お知らせ</h2>
      <p className="text-xs text-zinc-500">
        全ての整理券が発行され残数が無くなったとき、統合画面の発行状況エリアに表示する案内文です。空欄なら何も表示しません。
      </p>
      <textarea
        className="min-h-[80px] rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
        placeholder="例: 本日の整理券配布は終了しました。"
        value={value}
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-fit rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          保存
        </button>
        {saved && <span className="text-sm text-green-700 dark:text-green-400">保存しました</span>}
      </div>
    </div>
  );
}
