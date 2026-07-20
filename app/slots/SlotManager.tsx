"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/fetcher";

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

const POLL_INTERVAL_MS = 3000;

function formatTimeRange(startTime: string | null, endTime: string | null): string {
  if (!startTime && !endTime) return "—";
  return `${startTime ?? "—"}〜${endTime ?? "—"}`;
}

export default function SlotManager() {
  const { data, mutate, isLoading } = useSWR<{ slots: SlotStat[] }>(
    "/api/slots",
    jsonFetcher,
    { refreshInterval: POLL_INTERVAL_MS }
  );
  const slots = data?.slots ?? [];

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [capacity, setCapacity] = useState("10");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCapacity, setEditCapacity] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");

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

  async function handleDelete(id: number) {
    const res = await fetch(`/api/slots/${id}`, { method: "DELETE" });
    if (res.ok) {
      await mutate();
    } else {
      const resData = await res.json();
      alert(resData.error ?? "削除に失敗しました。");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-4 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900"
      >
        <h2 className="text-lg font-semibold">新しい時間枠を追加</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            キー
            <input
              className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-black"
              placeholder="1400"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            表示名
            <input
              className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-black"
              placeholder="14:00〜14:30"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            開始時刻
            <input
              type="time"
              className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-black"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            終了時刻
            <input
              type="time"
              className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-black"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            定員
            <input
              type="number"
              min={1}
              className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-black"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </label>
        </div>
        <p className="text-xs text-zinc-500">
          開始時刻を設定すると、統合画面の「現在開催中/次の開催」表示と、開始5分前より早いチェックインの拒否に使われます。未設定の枠は時間制限なしで受付できます。
        </p>
        {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-fit rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          追加する
        </button>
      </form>

      <AnnouncementEditor />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">登録済みの時間枠</h2>
        {isLoading && <p className="text-sm text-zinc-500">読み込み中…</p>}
        {!isLoading && slots.length === 0 && (
          <p className="text-sm text-zinc-500">まだ時間枠がありません。上のフォームから追加してください。</p>
        )}
        {slots.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs text-zinc-500 dark:border-white/10">
                  <th className="px-4 py-3 font-medium">表示名</th>
                  <th className="px-4 py-3 font-medium">キー</th>
                  <th className="px-4 py-3 font-medium">時間</th>
                  <th className="px-4 py-3 font-medium">発行 / 定員</th>
                  <th className="px-4 py-3 font-medium">チェックイン</th>
                  <th className="px-4 py-3 font-medium">残</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => (
                  <tr key={slot.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    {editingId === slot.id ? (
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
                        <td className="px-4 py-2">{slot.checkedIn}</td>
                        <td className="px-4 py-2">{slot.remaining}</td>
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
                        <td className="px-4 py-2">{slot.checkedIn}</td>
                        <td className="px-4 py-2">{slot.remaining}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => startEdit(slot)}
                              className="rounded-full border border-black/15 px-3 py-1 text-xs dark:border-white/15"
                            >
                              編集
                            </button>
                            <button
                              onClick={() => handleDelete(slot.id)}
                              className="rounded-full border border-red-300 px-3 py-1 text-xs text-red-600 dark:border-red-900 dark:text-red-400"
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** 全整理券発行済み時に統合画面へ表示する案内コメントの編集セクション。 */
function AnnouncementEditor() {
  const { data, mutate } = useSWR<{ announcement: string }>("/api/settings", jsonFetcher);
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
