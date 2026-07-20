import { createSlot, getSlotByKey, getStats } from "@/lib/db";

// リアルタイム集計を返すため、プリレンダー/ISRを確実に無効化する。
export const dynamic = "force-dynamic";

export async function GET() {
  const stats = getStats();
  return Response.json({ slots: stats.slots });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { key, label, capacity, startTime } = body ?? {};

  if (typeof key !== "string" || key.trim() === "") {
    return Response.json({ error: "key は必須です。" }, { status: 400 });
  }
  if (typeof label !== "string" || label.trim() === "") {
    return Response.json({ error: "label は必須です。" }, { status: 400 });
  }
  if (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity <= 0) {
    return Response.json({ error: "capacity は正の整数で指定してください。" }, { status: 400 });
  }
  if (getSlotByKey(key)) {
    return Response.json({ error: `key "${key}" は既に使用されています。` }, { status: 400 });
  }

  const slot = createSlot({
    key,
    label,
    capacity,
    startTime: typeof startTime === "string" ? startTime : null,
  });
  return Response.json({ slot }, { status: 201 });
}
