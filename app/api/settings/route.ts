import { getSetting, setSetting, SETTING_ANNOUNCEMENT } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ announcement: getSetting(SETTING_ANNOUNCEMENT) ?? "" });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { announcement } = body ?? {};
  if (typeof announcement !== "string") {
    return Response.json({ error: "announcement は文字列で指定してください。" }, { status: 400 });
  }
  setSetting(SETTING_ANNOUNCEMENT, announcement);
  return Response.json({ announcement });
}
