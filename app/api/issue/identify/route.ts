import { getSlot, getTicketByNumber } from "@/lib/db";
import { cancelIdentify, identifyNextCard } from "@/lib/nfc";

export const dynamic = "force-dynamic";

/**
 * 「発行」ステップ1: タグを識別する。
 * タグに書かれている整理番号を読み取り(またはmanual時は直接入力された整理番号で)、
 * DBに登録済みの整理券レコードを正として、時間枠ラベル等を返す。
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { manual, ticketNumber: manualTicketNumber } = body ?? {};

  let ticketNumber: string;
  let uid: string | null;

  if (manual === true) {
    if (typeof manualTicketNumber !== "string" || manualTicketNumber.trim() === "") {
      return Response.json({ success: false, error: "整理番号は必須です。" }, { status: 400 });
    }
    ticketNumber = manualTicketNumber.trim();
    uid = null;
  } else {
    try {
      const result = await identifyNextCard();
      if (!result.payload) {
        return Response.json(
          {
            success: false,
            error: "整理券データが読み取れませんでした。準備済みのタグをかざしてください。",
            uid: result.uid,
          },
          { status: 400 }
        );
      }
      ticketNumber = result.payload.t;
      uid = result.uid;
    } catch (err) {
      const message = err instanceof Error ? err.message : "識別に失敗しました。";
      return Response.json({ success: false, error: message }, { status: 400 });
    }
  }

  const ticket = getTicketByNumber(ticketNumber);
  if (!ticket) {
    return Response.json(
      { success: false, error: "このタグに対応する整理券が準備されていません。", uid, ticketNumber },
      { status: 400 }
    );
  }
  if (ticket.status === "void") {
    return Response.json(
      { success: false, error: "この整理券は無効化されています。", uid, ticketNumber },
      { status: 400 }
    );
  }

  const slot = getSlot(ticket.slotId);
  return Response.json({
    success: true,
    uid,
    ticketNumber,
    slotId: ticket.slotId,
    slotLabel: slot?.label ?? null,
    alreadyIssued: ticket.name != null && ticket.name !== "",
    existingName: ticket.name,
  });
}

/** 識別アーム(タップ待受)を取り消す。 */
export async function DELETE() {
  cancelIdentify();
  return Response.json({ cancelled: true });
}
