"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/fetcher";

export interface SlotStat {
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

export function formatTimeRange(startTime: string | null, endTime: string | null): string {
  if (!startTime && !endTime) return "—";
  return `${startTime ?? "—"}〜${endTime ?? "—"}`;
}

/**
 * 時間枠の一覧・集計(`GET /api/slots`)をポーリングする共有フック。
 * SWRは同一キーのリクエストを自動でdedupeするため、事前準備モードと
 * 整理券発行モードの両方から呼んでもポーリングは1本に集約される。
 */
export function useSlots() {
  return useSWR<{ slots: SlotStat[] }>("/api/slots", jsonFetcher, {
    refreshInterval: POLL_INTERVAL_MS,
  });
}
