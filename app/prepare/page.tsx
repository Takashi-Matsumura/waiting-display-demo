import BackLink from "@/app/components/BackLink";
import PreparePanel from "./PreparePanel";

export default function PreparePage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <BackLink />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">整理券 準備</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          整理番号と時間枠をNTAGに先に書き込みます（受付名は当日「発行」画面で入力します）。
        </p>
        <div className="mt-8">
          <PreparePanel />
        </div>
      </div>
    </div>
  );
}
