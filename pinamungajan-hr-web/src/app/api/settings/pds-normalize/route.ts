import { NextResponse } from "next/server";
import { READ_ONLY_MODE } from "@/lib/readOnlyMode";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (READ_ONLY_MODE) {
    // Still allow setting UI-only preferences in read-only mode.
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new NextResponse("Invalid JSON body", { status: 400 });
  }

  const enabled = body?.enabled === true;

  const res = NextResponse.json({ ok: true, enabled });
  res.cookies.set("pds_normalize_legal", enabled ? "1" : "0", {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
