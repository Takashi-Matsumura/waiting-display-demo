import BackLink from "@/app/components/BackLink";
import EventSetupPanel from "./EventSetupPanel";

export default function SetupPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <BackLink />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">イベント準備</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          時間枠の登録と、その枠でのNTAGへの整理番号書き込み（準備）をこの画面でまとめて行います。受付名は当日「トークン発行」画面で入力します。
        </p>
        <div className="mt-8">
          <EventSetupPanel />
        </div>
      </div>
    </div>
  );
}
