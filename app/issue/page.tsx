import IssuePanel from "./IssuePanel";

export default function IssuePage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight">整理券 発行/登録</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          整理番号・受付名・時間枠を入力し、NTAGにかざして書き込みます。
        </p>
        <div className="mt-8">
          <IssuePanel />
        </div>
      </div>
    </div>
  );
}
