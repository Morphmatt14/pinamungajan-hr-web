import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Join with employee_documents to get storage info
  const { data, error } = await supabase
    .from("extractions")
    .select(`
      id,
      document_id,
      page_index,
      employee_documents (
        storage_bucket,
        storage_path
      )
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    return new NextResponse(error?.message || "Extraction not found", { status: 404 });
  }

  const doc = (data as any).employee_documents;
  if (!doc?.storage_bucket || !doc?.storage_path) {
    return new NextResponse("Document storage info missing", { status: 400 });
  }

  // Get signed URL
  const { data: signedData, error: signedError } = await supabase.storage
    .from(doc.storage_bucket)
    .createSignedUrl(doc.storage_path, 3600);

  if (signedError) {
    return new NextResponse(signedError.message, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    file_url: signedData.signedUrl
  });
}
