import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const bucket = String(url.searchParams.get("bucket") || "").trim();
  const path = String(url.searchParams.get("path") || "").trim();
  const filename = String(url.searchParams.get("filename") || "download").trim();
  const contentType = String(url.searchParams.get("contentType") || "").trim();

  if (!bucket || !path) {
    return new NextResponse("Missing bucket/path", { status: 400 });
  }

  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    return new NextResponse(error?.message || "Failed to download", { status: 400 });
  }

  const buf = Buffer.from(await data.arrayBuffer());
  const ct = contentType || data.type || "application/octet-stream";

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "content-type": ct,
      "content-disposition": `attachment; filename=${JSON.stringify(filename)}`,
      "cache-control": "no-store",
    },
  });
}
