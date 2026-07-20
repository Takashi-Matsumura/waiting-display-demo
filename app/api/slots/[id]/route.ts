import { deleteSlot, getSlot, updateSlot } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const slotId = Number(id);
  if (!Number.isInteger(slotId) || !getSlot(slotId)) {
    return Response.json({ error: "指定された時間枠が見つかりません。" }, { status: 404 });
  }

  const body = await request.json();
  const { label, capacity, startTime, endTime } = body ?? {};

  if (capacity !== undefined && (!Number.isInteger(capacity) || capacity <= 0)) {
    return Response.json({ error: "capacity は正の整数で指定してください。" }, { status: 400 });
  }

  const slot = updateSlot(slotId, {
    label: typeof label === "string" ? label : undefined,
    capacity: typeof capacity === "number" ? capacity : undefined,
    startTime: startTime !== undefined ? startTime : undefined,
    endTime: endTime !== undefined ? endTime : undefined,
  });
  return Response.json({ slot });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const slotId = Number(id);
  if (!Number.isInteger(slotId) || !getSlot(slotId)) {
    return Response.json({ error: "指定された時間枠が見つかりません。" }, { status: 404 });
  }

  try {
    deleteSlot(slotId);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "削除に失敗しました。";
    return Response.json({ error: message }, { status: 409 });
  }
}
