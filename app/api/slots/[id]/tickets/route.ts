import { getSlot, listTicketsBySlot } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 指定した時間枠に属する整理券の一覧を返す(紛失タグの再発行UIで使用)。 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const slotId = Number(id);
  if (!Number.isInteger(slotId) || !getSlot(slotId)) {
    return Response.json({ error: "指定された時間枠が見つかりません。" }, { status: 404 });
  }

  const tickets = listTicketsBySlot(slotId).map((t) => ({
    ticketNumber: t.ticketNumber,
    name: t.name,
    status: t.status,
    reissuedAt: t.reissuedAt,
  }));
  return Response.json({ tickets });
}
