import Link from "next/link";

const NAV_ITEMS = [
  {
    href: "/setup",
    title: "イベント準備",
    description: "時間枠の登録と、NTAGへの整理番号書き込み（準備）をまとめて行います。",
  },
  {
    href: "/issue",
    title: "トークン発行",
    description: "当日、タグをかざして受付名を書き込み発行します。",
  },
  {
    href: "/checkin",
    title: "受付ディスプレイ",
    description: "当日、NTAGでチェックインし、現在/次の受付状況と発行状況を表示します。",
    newTab: true,
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="w-full max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">整理券管理アプリ</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          イベントブースでのNTAG整理券の発行・受付・表示を行います。
        </p>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {NAV_ITEMS.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              target={item.newTab ? "_blank" : undefined}
              rel={item.newTab ? "noopener noreferrer" : undefined}
              className={`rounded-xl border border-black/10 bg-white p-6 transition-colors hover:border-black/20 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20 ${
                index === 0 ? "sm:col-span-2" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">
                  {index + 1}
                </span>
                <h2 className="text-lg font-semibold">{item.title}</h2>
              </div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {item.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
