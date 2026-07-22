import type { NfcStatus } from "@/app/hooks/useNfcStatus";

/**
 * NFCリーダーの接続状態を表示するプレゼン専用バー。
 * 事前準備・整理券発行の両モードで共通のハードウェア状態のため、
 * モードをまたいで1箇所に表示する。
 */
export default function NfcStatusBar({ nfc }: { nfc: NfcStatus | undefined }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-zinc-900">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${nfc?.connected ? "bg-green-500" : "bg-zinc-400"}`}
      />
      {nfc === undefined
        ? "リーダー状態を確認中…"
        : nfc.connected
          ? `NFCリーダー接続中: ${nfc.readerName}`
          : "NFCリーダー未接続（手動モードのみ利用できます）"}
    </div>
  );
}
