import { completeTicketName, getSlot, getTicketByNumber } from "@/lib/db";
import { cancelIssue, issueNextCard } from "@/lib/nfc";

export const dynamic = "force-dynamic";

/**
 * 「発行」ステップ2: 識別済みの整理券に受付名を書き込み、発行を完了する。
 * NFC時は、識別ステップで読み取ったUID(expectedUid)と異なるタグへは書込を行わない。
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { ticketNumber, name, expectedUid, manual } = body ?? {};

  if (typeof ticketNumber !== "string" || ticketNumber.trim() === "") {
    return Response.json({ success: false, error: "整理番号は必須です。" }, { status: 400 });
  }
  if (typeof name !== "string" || name.trim() === "") {
    return Response.json({ success: false, error: "受付名は必須です。" }, { status: 400 });
  }

  const ticket = getTicketByNumber(ticketNumber);
  if (!ticket) {
    return Response.json(
      { success: false, error: "この整理番号の整理券が見つかりません。" },
      { status: 400 }
    );
  }
  if (ticket.status === "void") {
    return Response.json({ success: false, error: "この整理券は無効化されています。" }, { status: 400 });
  }
  const slot = getSlot(ticket.slotId);
  if (!slot) {
    return Response.json({ success: false, error: "時間枠が見つかりません。" }, { status: 400 });
  }

  // リーダー無しでの検証・運用向けの手動発行完了(NFC書込を行わない)。
  if (manual === true) {
    const { result, ticket: updated, wasNamed } = completeTicketName(ticketNumber, name);
    if (result !== "ok") {
      return Response.json({ success: false, error: "発行に失敗しました。" }, { status: 400 });
    }
    return Response.json({ success: true, uid: updated?.uid ?? null, ticket: updated, wasNamed });
  }

  // NFC発行完了: カードのタップを待ち受けて NDEF 書込(受付名を追加) + UID 捕捉を行う。
  try {
    const { uid } = await issueNextCard(
      { t: ticketNumber, n: name, s: slot.key },
      { expectedUid: typeof expectedUid === "string" ? expectedUid : undefined }
    );
    const { result, ticket: updated, wasNamed } = completeTicketName(ticketNumber, name, uid);
    if (result !== "ok") {
      return Response.json({ success: false, error: "発行に失敗しました。" }, { status: 400 });
    }
    return Response.json({ success: true, uid, ticket: updated, wasNamed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "発行に失敗しました。";
    return Response.json({ success: false, error: message }, { status: 400 });
  }
}

/** 発行完了アーム(タップ待受)を取り消す。 */
export async function DELETE() {
  cancelIssue();
  return Response.json({ cancelled: true });
}
