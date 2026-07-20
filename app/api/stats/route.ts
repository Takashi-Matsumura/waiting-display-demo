import { getStats } from "@/lib/db";

// ディスプレイ画面が数秒間隔でポーリングする読取専用エンドポイント。
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getStats());
}
