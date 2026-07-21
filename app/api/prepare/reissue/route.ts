import { getSlot, getTicketByNumber, markTicketReissued } from "@/lib/db";
import { issueNextCard } from "@/lib/nfc";

export const dynamic = "force-dynamic";

/**
 * 再発行: 紛失した物理タグの代替として、既に登録済みの整理券(番号・受付名はそのまま)を
 * 新しいタグへ書き込む。/api/prepare と異なり新規レコードのINSERT・定員チェックは行わない
 * (同一レコードのタグ差し替えであり、新しい参加者枠の消費ではないため)。
 * タップ待受のキャンセルは既存の DELETE /api/prepare をそのまま使う(cancelIssue()は
 * 何がアームしたかに関わらず現在のアームを汎用的に取り消すため、専用エンドポイントは不要)。
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { ticketNumber, manual } = body ?? {};

  if (typeof ticketNumber !== "string" || ticketNumber.trim() === "") {
    return Response.json({ success: false, error: "整理番号は必須です。" }, { status: 400 });
  }
  const ticket = getTicketByNumber(ticketNumber);
  if (!ticket) {
    return Response.json(
      { success: false, error: "この整理番号の整理券が見つかりません。" },
      { status: 404 }
    );
  }
  if (ticket.status === "void") {
    return Response.json(
      { success: false, error: "この整理券は無効化されています。" },
      { status: 400 }
    );
  }
  const slot = getSlot(ticket.slotId); // slotIdはクライアントから受け取らずDB側の値を信頼する
  if (!slot) {
    return Response.json({ success: false, error: "時間枠が見つかりません。" }, { status: 400 });
  }

  const name = ticket.name ?? ""; // 既存の受付名をそのまま新タグへ引き継ぐ(未発行なら空文字)

  // リーダー無しでの検証・運用向けの手動再発行(NFC書込は行わないが、再発行した記録は残す)。
  if (manual === true) {
    const updated = markTicketReissued(ticket.ticketNumber);
    return Response.json({ success: true, uid: null, ticket: updated ?? ticket });
  }

  try {
    const { uid } = await issueNextCard({ t: ticket.ticketNumber, n: name, s: slot.key });
    const updated = markTicketReissued(ticket.ticketNumber, uid);
    return Response.json({ success: true, uid, ticket: updated ?? ticket });
  } catch (err) {
    const message = err instanceof Error ? err.message : "再発行に失敗しました。";
    return Response.json({ success: false, error: message }, { status: 400 });
  }
}
