import Link from "next/link";

const NAV_ITEMS = [
  {
    href: "/slots",
    title: "時間枠マスタ管理",
    description: "参加時間の枠と定員を登録・編集します。",
  },
  {
    href: "/issue",
    title: "発行 / 登録",
    description: "NTAGをかざして整理券情報を書き込みます。",
  },
  {
    href: "/checkin",
    title: "受付 / チェックイン",
    description: "当日、NTAGをかざしてチェックインします。",
  },
  {
    href: "/display",
    title: "ディスプレイ",
    description: "会場モニタ用に受付状況をリアルタイム表示します。",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="w-full max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">整理券運営システム</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          イベントブースでのNTAG整理券の発行・受付・表示を行います。
        </p>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl border border-black/10 bg-white p-6 transition-colors hover:border-black/20 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20"
            >
              <h2 className="text-lg font-semibold">{item.title}</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {item.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
