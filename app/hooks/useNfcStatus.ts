"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/fetcher";

export interface NfcStatus {
  connected: boolean;
  readerName: string;
  mode: "idle" | "issuing" | "identifying";
  cardPresent: boolean;
}

const POLL_INTERVAL_MS = 2000;

/**
 * NFCリーダーの接続状態(`GET /api/nfc`)をポーリングする共有フック。
 * SWRは同一キーのリクエストを自動でdedupeするため、複数コンポーネントから
 * 呼んでもポーリングは1本に集約される。
 */
export function useNfcStatus() {
  return useSWR<NfcStatus>("/api/nfc", jsonFetcher, {
    refreshInterval: POLL_INTERVAL_MS,
  });
}
