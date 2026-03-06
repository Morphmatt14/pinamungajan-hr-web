import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  
  const { searchParams } = new URL(request.url);
  const extractionId = searchParams.get("extraction_id");
  
  if (!extractionId) {
    return NextResponse.json({ error: "Missing extraction_id" }, { status: 400 });
  }
  
  // Fetch the extraction
  const { data: extraction, error } = await supabase
    .from("extractions")
    .select("*")
    .eq("id", extractionId)
    .single();
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // Extract appointment data from both possible locations
  const rawJson = extraction?.raw_extracted_json;
  const appointmentData = rawJson?.appointment_data || extraction?.appointment_data;
  
  return NextResponse.json({
    extraction_id: extractionId,
    status: extraction?.status,
    has_raw_extracted_json: !!rawJson,
    has_appointment_data_column: !!extraction?.appointment_data,
    appointment_data: appointmentData,
    appointment_data_keys: appointmentData ? Object.keys(appointmentData) : [],
    raw_json_keys: rawJson ? Object.keys(rawJson) : [],
  });
}
