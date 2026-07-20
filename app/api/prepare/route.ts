import { countIssuedForSlot, getSlot, getTicketByNumber, issueTicketWithCapacityCheck } from "@/lib/db";
import { cancelIssue, issueNextCard } from "@/lib/nfc";

export const dynamic = "force-dynamic";

/**
 * 「準備」: イベント前にNTAGへ整理番号・時間枠を書き込み、受付名は未設定(null)のまま
 * 整理券レコードを作成する(この時点で定員が消費される)。受付名は「発行」ステップ
 * (/api/issue/identify → /api/issue/complete)で後から書き込む。
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { ticketNumber, slotId, manual } = body ?? {};

  if (typeof ticketNumber !== "string" || ticketNumber.trim() === "") {
    return Response.json({ success: false, error: "整理番号は必須です。" }, { status: 400 });
  }
  const slot = typeof slotId === "number" ? getSlot(slotId) : undefined;
  if (!slot) {
    return Response.json({ success: false, error: "時間枠が見つかりません。" }, { status: 400 });
  }
  if (getTicketByNumber(ticketNumber)) {
    return Response.json(
      { success: false, error: `整理番号 "${ticketNumber}" は既に使用されています。` },
      { status: 400 }
    );
  }
  if (countIssuedForSlot(slot.id) >= slot.capacity) {
    return Response.json(
      { success: false, error: "この時間枠は満員のため準備できません。" },
      { status: 400 }
    );
  }

  // リーダー無しでの検証・運用向けの手動準備(NFC書込を行わない)。
  if (manual === true) {
    try {
      const ticket = issueTicketWithCapacityCheck({
        ticketNumber,
        name: null,
        slotId: slot.id,
        uid: null,
      });
      return Response.json({ success: true, uid: null, ticket }, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "準備に失敗しました。";
      return Response.json({ success: false, error: message }, { status: 400 });
    }
  }

  // NFC準備: カードのタップを待ち受けて NDEF 書込(受付名は空文字) + UID 捕捉を行う。
  try {
    const { uid } = await issueNextCard({ t: ticketNumber, n: "", s: slot.key });
    const ticket = issueTicketWithCapacityCheck({
      ticketNumber,
      name: null,
      slotId: slot.id,
      uid,
    });
    return Response.json({ success: true, uid, ticket }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "準備に失敗しました。";
    return Response.json({ success: false, error: message }, { status: 400 });
  }
}

/** 準備アーム(タップ待受)を取り消す。 */
export async function DELETE() {
  cancelIssue();
  return Response.json({ cancelled: true });
}
