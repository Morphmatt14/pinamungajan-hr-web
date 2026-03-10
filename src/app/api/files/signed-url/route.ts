import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const bucket = String(body.bucket || "");
  const path = String(body.path || "");
  const expiresIn = Math.min(Math.max(Number(body.expiresIn || 60), 10), 60 * 60);

  if (!bucket || !path) {
    return new NextResponse("Missing bucket/path", { status: 400 });
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);

  if (error) {
    return new NextResponse(error.message, { status: 400 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl });
}
