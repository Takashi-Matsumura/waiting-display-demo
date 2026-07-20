import BackLink from "@/app/components/BackLink";
import SlotManager from "./SlotManager";

export default function SlotsPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <BackLink />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">時間枠マスタ管理</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          参加時間の枠と定員を登録します。発行画面・受付画面・ディスプレイはここで作成した枠を参照します。
        </p>
        <div className="mt-8">
          <SlotManager />
        </div>
      </div>
    </div>
  );
}
