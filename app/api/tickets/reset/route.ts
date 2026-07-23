import { resetAllTickets } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 全ての時間枠に紐づく整理券(予約)を削除する。時間枠自体の設定は変更しない。 */
export async function POST() {
  resetAllTickets();
  return Response.json({ ok: true });
}
