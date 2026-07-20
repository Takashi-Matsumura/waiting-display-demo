import { getSetting, getStats, SETTING_ANNOUNCEMENT } from "@/lib/db";
import { classifySlots } from "@/lib/schedule";

// 統合画面(受付/受付状況ディスプレイ)が数秒間隔でポーリングする読取専用エンドポイント。
export const dynamic = "force-dynamic";

export async function GET() {
  const stats = getStats();

  // 「現在開催中/次の開催」はサーバーローカル時刻で判定する。
  // クライアントのレンダー中に new Date() を呼ぶと React Compiler の purity 系
  // lintルールに抵触しうるため、判定結果はサーバーで確定させてそのまま返す。
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const { current, next } = classifySlots(stats.slots, nowMinutes);

  return Response.json({
    ...stats,
    current,
    next,
    announcement: getSetting(SETTING_ANNOUNCEMENT) ?? "",
  });
}
