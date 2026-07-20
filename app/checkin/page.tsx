import BackLink from "@/app/components/BackLink";
import CheckinPanel from "./CheckinPanel";

export default function CheckinPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <BackLink />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">受付 / チェックイン</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          NTAGをリーダーにかざしてチェックインします。
        </p>
        <div className="mt-8">
          <CheckinPanel />
        </div>
      </div>
    </div>
  );
}
