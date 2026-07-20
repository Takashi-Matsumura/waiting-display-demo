import { getStatus } from "@/lib/nfc";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getStatus());
}
