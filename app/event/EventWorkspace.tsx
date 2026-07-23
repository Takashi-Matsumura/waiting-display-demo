"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BackLink from "@/app/components/BackLink";
import NfcStatusBar from "@/app/components/NfcStatusBar";
import { useNfcStatus } from "@/app/hooks/useNfcStatus";
import EventSetupPanel from "./EventSetupPanel";
import IssuePanel from "./IssuePanel";

type Mode = "prepare" | "issue";

const MODE_META: Record<
  Mode,
  { label: string; title: string; description: string; maxWidth: string }
> = {
  prepare: {
    label: "事前準備",
    title: "イベント準備",
    description: "",
    maxWidth: "max-w-6xl",
  },
  issue: {
    label: "整理券発行",
    title: "整理券 発行",
    description:
      "タグをかざして準備済みの整理番号・時間枠を確認し、受付名を書き込んで発行します。",
    maxWidth: "max-w-6xl",
  },
};

function resolveMode(value: string | null): Mode {
  return value === "issue" ? "issue" : "prepare";
}

export default function EventWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = resolveMode(searchParams.get("mode"));
  const meta = MODE_META[mode];

  const { data: nfc } = useNfcStatus();
  const [panelBusy, setPanelBusy] = useState(false);

  // NFCリーダーは同時に1枚しか扱えないため(lib/nfc.ts)、パネル内でアーム中
  // (準備/再発行/識別/発行の書込待ち)はモード切替を禁止する。クライアント側の
  // panelBusy に加えて、サーバー側のアーム状態(nfc.mode)もバックストップとして併用する。
  const switchDisabled = panelBusy || (nfc !== undefined && nfc.mode !== "idle");

  function handleModeChange(next: Mode) {
    if (next === mode || switchDisabled) return;
    router.replace(next === "prepare" ? "/event" : "/event?mode=issue", {
      scroll: false,
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-black/10 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-zinc-900/90">
        <div
          className={`mx-auto flex w-full ${meta.maxWidth} flex-wrap items-center justify-between gap-4 px-6 py-3 2xl:max-w-[1900px] 2xl:px-16`}
        >
          <div className="flex items-center gap-3">
            <BackLink />
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">{meta.title}</h1>
          </div>
          <div className="inline-flex rounded-full border border-black/10 bg-zinc-100 p-1 dark:border-white/10 dark:bg-zinc-800">
            {(Object.keys(MODE_META) as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                disabled={switchDisabled}
                title={switchDisabled ? "タグの読み書き待ちの間はモードを切り替えられません" : undefined}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  m === mode
                    ? "bg-foreground text-background"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {MODE_META[m].label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div
        className={`mx-auto w-full ${meta.maxWidth} flex-1 px-6 pb-10 2xl:max-w-[1900px] 2xl:px-16 ${
          meta.description ? "pt-10" : "pt-6"
        }`}
      >
        {meta.description && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{meta.description}</p>
        )}

        <div className={`flex flex-col gap-6 ${meta.description ? "mt-8" : ""}`}>
          {mode === "issue" && <NfcStatusBar nfc={nfc} />}
          {mode === "prepare" ? (
            <EventSetupPanel onBusyChange={setPanelBusy} />
          ) : (
            <IssuePanel onBusyChange={setPanelBusy} />
          )}
        </div>
      </div>
    </div>
  );
}
