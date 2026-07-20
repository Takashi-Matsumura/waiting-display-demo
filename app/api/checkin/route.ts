import { checkInTicket, getSlot } from "@/lib/db";
import { drainReadEvents, getStatus } from "@/lib/nfc";

export const dynamic = "force-dynamic";

interface CheckinResultPayload {
  ticketNumber: string;
  name: string | null;
  slotLabel: string | null;
  slotStartTime: string | null;
  result: "ok" | "already" | "unknown" | "void" | "not_issued" | "too_early";
}

function runCheckin(ticketNumber: string): CheckinResultPayload {
  const { result, ticket, slot } = checkInTicket(ticketNumber);
  return {
    ticketNumber,
    name: ticket?.name ?? null,
    slotLabel: slot?.label ?? null,
    slotStartTime: slot?.startTime ?? null,
    result,
  };
}

/**
 * 受付画面が短間隔でポーリングするエンドポイント。
 * NFCリーダーの読取イベントをドレインし、各イベントについてチェックインを実行して返す。
 * ドレインするのはこのエンドポイントのみ（ディスプレイは /api/stats で非ドレイン）なのでレースは発生しない。
 */
export async function GET() {
  const status = getStatus();
  const events = drainReadEvents();

  const results: CheckinResultPayload[] = events.map((event) => {
    if (!event.payload) {
      return {
        ticketNumber: event.raw || event.uid,
        name: null,
        slotLabel: null,
        slotStartTime: null,
        result: "unknown",
      };
    }
    return runCheckin(event.payload.t);
  });

  return Response.json({
    connected: status.connected,
    tagPresent: status.cardPresent,
    results,
  });
}

/** リーダー無し検証用・障害時のフォールバック用の手動チェックイン。 */
export async function POST(request: Request) {
  const body = await request.json();
  const { ticketNumber } = body ?? {};
  if (typeof ticketNumber !== "string" || ticketNumber.trim() === "") {
    return Response.json({ error: "ticketNumber は必須です。" }, { status: 400 });
  }

  const { result, ticket, slot } = checkInTicket(ticketNumber);
  const slotLabel = slot?.label ?? (ticket ? getSlot(ticket.slotId)?.label ?? null : null);

  return Response.json({ result, ticket, slot: slot ?? (slotLabel ? { label: slotLabel } : null) });
}
