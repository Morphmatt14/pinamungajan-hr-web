import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const body = await request.json();

  const storage_bucket = String(body.storage_bucket || "hr-documents");
  const storage_path = String(body.storage_path || "");
  const mime_type = String(body.mime_type || "application/octet-stream");
  const original_filename = String(body.original_filename || "");
  const employee_id = body.employee_id === null || body.employee_id === undefined ? null : String(body.employee_id);
  const file_size_bytes =
    body.file_size_bytes === null || body.file_size_bytes === undefined
      ? null
      : Number(body.file_size_bytes);

  if (!storage_path || !original_filename) {
    return new NextResponse("Missing storage_path or original_filename", { status: 400 });
  }

  const { data: doc, error: docErr } = await supabase
    .from("employee_documents")
    .insert({
      storage_bucket,
      storage_path,
      mime_type,
      original_filename,
      file_size_bytes,
      employee_id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (docErr) {
    return new NextResponse(docErr.message, { status: 400 });
  }

  const { data: extraction, error: exErr } = await supabase
    .from("extractions")
    .insert({
      document_id: doc.id,
      status: "uploaded",
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (exErr) {
    return new NextResponse(exErr.message, { status: 400 });
  }

  return NextResponse.json({ extraction_id: extraction.id });
}
