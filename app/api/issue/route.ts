import { countIssuedForSlot, getSlot, getTicketByNumber, issueTicketWithCapacityCheck } from "@/lib/db";
import { cancelIssue, issueNextCard } from "@/lib/nfc";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();
  const { ticketNumber, name, slotId, manual } = body ?? {};

  if (typeof ticketNumber !== "string" || ticketNumber.trim() === "") {
    return Response.json({ success: false, error: "整理番号は必須です。" }, { status: 400 });
  }
  if (typeof name !== "string" || name.trim() === "") {
    return Response.json({ success: false, error: "受付名は必須です。" }, { status: 400 });
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
      { success: false, error: "この時間枠は満員のため発行できません。" },
      { status: 400 }
    );
  }

  // リーダー無しでの検証・運用向けの手動発行(NFC書込を行わない)。
  if (manual === true) {
    try {
      const ticket = issueTicketWithCapacityCheck({
        ticketNumber,
        name,
        slotId: slot.id,
        uid: null,
      });
      return Response.json({ success: true, uid: null, ticket }, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "発行に失敗しました。";
      return Response.json({ success: false, error: message }, { status: 400 });
    }
  }

  // NFC発行: カードのタップを待ち受けて NDEF 書込 + UID 捕捉を行う。
  try {
    const { uid } = await issueNextCard({ t: ticketNumber, n: name, s: slot.key });
    const ticket = issueTicketWithCapacityCheck({
      ticketNumber,
      name,
      slotId: slot.id,
      uid,
    });
    return Response.json({ success: true, uid, ticket }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "発行に失敗しました。";
    return Response.json({ success: false, error: message }, { status: 400 });
  }
}

/** 発行アーム(タップ待受)を取り消す。 */
export async function DELETE() {
  cancelIssue();
  return Response.json({ cancelled: true });
}
