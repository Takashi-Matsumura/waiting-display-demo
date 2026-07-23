import {
  getSetting,
  setSetting,
  SETTING_ANNOUNCEMENT,
  SETTING_EVENT_TITLE,
  SETTING_LUNCH_VIDEO,
} from "@/lib/db";

export const dynamic = "force-dynamic";

function readSettings() {
  return {
    announcement: getSetting(SETTING_ANNOUNCEMENT) ?? "",
    eventTitle: getSetting(SETTING_EVENT_TITLE) ?? "",
    lunchVideo: getSetting(SETTING_LUNCH_VIDEO) ?? "",
  };
}

export async function GET() {
  return Response.json(readSettings());
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { announcement, eventTitle, lunchVideo } = body ?? {};

  if (announcement !== undefined) {
    if (typeof announcement !== "string") {
      return Response.json({ error: "announcement は文字列で指定してください。" }, { status: 400 });
    }
    setSetting(SETTING_ANNOUNCEMENT, announcement);
  }

  if (eventTitle !== undefined) {
    if (typeof eventTitle !== "string") {
      return Response.json({ error: "eventTitle は文字列で指定してください。" }, { status: 400 });
    }
    setSetting(SETTING_EVENT_TITLE, eventTitle);
  }

  if (lunchVideo !== undefined) {
    if (typeof lunchVideo !== "string") {
      return Response.json({ error: "lunchVideo は文字列で指定してください。" }, { status: 400 });
    }
    setSetting(SETTING_LUNCH_VIDEO, lunchVideo);
  }

  return Response.json(readSettings());
}
