import { AppShell } from "@/components/AppShell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RunOcrButton } from "@/app/review/[id]/RunOcrButton";
import { GeneratePdsPdfButton } from "@/app/review/[id]/GeneratePdsPdfButton";
import { formatIsoToDdMmYyyy } from "@/lib/pds/validators";
import { CommitEmployeePanel } from "@/app/review/[id]/CommitEmployeePanel";
import { cookies } from "next/headers";
import { SexConfirm } from "@/app/review/[id]/SexConfirm";
import { ExtractedPhotoPanel } from "@/app/review/[id]/ExtractedPhotoPanel";
import { DebugExtractionPanel } from "@/app/review/[id]/DebugExtractionPanel";

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: extraction, error } = await supabase
    .from("extractions")
    .select(
      "id, status, raw_extracted_json, normalized_json, validated_json, warnings, errors, evidence, confidence, document_id, doc_type_user_selected, doc_type_final, doc_type_detected, doc_type_mismatch_warning, appointment_data, extraction_debug"
    )
    .eq("id", id)
    .single();

  const cookieStore = await cookies();
  const normCookie = cookieStore.get("pds_normalize_legal")?.value;
  const normalizeEnabled = normCookie === null || normCookie === undefined ? true : normCookie === "1";
  const normDebug = (extraction as any)?.raw_extracted_json?.debug?.normalize;

  let originalSignedUrl: string | null = null;
  let originalInfo: { filename: string; mime: string } | null = null;
  let searchableSignedUrl: string | null = null;
  let linkedEmployeeIdFromDoc: string | null = null;
  let originalDownloadHref: string | null = null;
  let searchableDownloadHref: string | null = null;

  if (!error && extraction?.document_id) {
    const { data: doc } = await supabase
      .from("employee_documents")
      .select("storage_bucket, storage_path, original_filename, mime_type, employee_id")
      .eq("id", extraction.document_id)
      .single();

    if (doc?.storage_bucket && doc?.storage_path) {
      originalInfo = { filename: doc.original_filename, mime: doc.mime_type };
      linkedEmployeeIdFromDoc = (doc as any).employee_id ? String((doc as any).employee_id) : null;
      const { data: signed } = await supabase.storage
        .from(doc.storage_bucket)
        .createSignedUrl(doc.storage_path, 60 * 10);
      originalSignedUrl = signed?.signedUrl ?? null;

      const qs = new URLSearchParams({
        bucket: String(doc.storage_bucket),
        path: String(doc.storage_path),
        filename: String(doc.original_filename || "original"),
        contentType: String(doc.mime_type || ""),
      });
      originalDownloadHref = `/api/files/download?${qs.toString()}`;
    }

    const searchable = (extraction as any)?.raw_extracted_json?.searchable_pdf;
    if (searchable?.storage_bucket && searchable?.storage_path) {
      const { data: signed } = await supabase.storage
        .from(String(searchable.storage_bucket))
        .createSignedUrl(String(searchable.storage_path), 60 * 10);
      searchableSignedUrl = signed?.signedUrl ?? null;

      const qs = new URLSearchParams({
        bucket: String(searchable.storage_bucket),
        path: String(searchable.storage_path),
        filename: String(searchable.filename || "searchable.pdf"),
        contentType: "application/pdf",
      });
      searchableDownloadHref = `/api/files/download?${qs.toString()}`;
    }
  }

  return (
    <AppShell title="Review Extraction">
      {error ? (
        <div className="rounded-lg border bg-white p-4 text-sm text-red-700">{error.message}</div>
      ) : (
        <div className="grid gap-4">
          <div className="rounded-xl border bg-white p-4 text-sm shadow-sm">
            <div className="font-medium">Status: {extraction.status}</div>
            <div className="mt-2 text-xs text-zinc-800">Extraction ID: {extraction.id}</div>
          </div>

          {/* Document Type Section */}
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Document Type</div>
            <div className="mt-2 grid gap-2 text-sm">
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
                  <div className="rounded-md bg-white px-2 py-1">
                    <div className="text-[11px] font-semibold text-slate-900">User Selected</div>
                    <div className="mt-0.5 text-xs text-slate-900">
                      {(extraction as any)?.doc_type_user_selected || "Auto-detect"}
                    </div>
                  </div>
                  <div className="rounded-md bg-white px-2 py-1">
                    <div className="text-[11px] font-semibold text-slate-900">Detected</div>
                    <div className="mt-0.5 text-xs text-slate-900">
                      {(extraction as any)?.doc_type_detected || "—"}
                    </div>
                  </div>
                  <div className="rounded-md bg-white px-2 py-1">
                    <div className="text-[11px] font-semibold text-slate-900">Final Type Used</div>
                    <div className="mt-0.5 text-xs font-semibold text-blue-700">
                      {(extraction as any)?.doc_type_final || "—"}
                    </div>
                  </div>
                </div>
                
                {/* Mismatch Warning */}
                {(extraction as any)?.doc_type_mismatch_warning && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="text-xs font-semibold text-amber-900">
                      ⚠️ Type Mismatch Detected
                    </div>
                    <div className="mt-1 text-xs text-amber-800">
                      The system detected this document as <strong>{(extraction as any)?.doc_type_detected}</strong>, 
                      but you selected <strong>{(extraction as any)?.doc_type_user_selected}</strong>. 
                      Please review and confirm the correct type.
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] text-amber-700 hover:bg-amber-100"
                        onClick={() => {
                          // This would trigger a re-extraction with the detected type
                          // For now, just a placeholder action
                          alert("Re-running OCR with detected type: " + (extraction as any)?.doc_type_detected);
                        }}
                      >
                        Use Detected Type
                      </button>
                      <button
                        type="button"
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                      >
                        Keep Selected Type
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TYPE-SPECIFIC EXTRACTION PANELS */}
          {(extraction as any)?.doc_type_final === "appointment" ? (
            /* APPOINTMENT: Show appointment fields ONLY */
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Appointment Details</div>
              <div className="mt-2 text-xs text-slate-600">
                Appointment documents update Position, Office, SG, and Salary in the Masterlist.
              </div>
              <div className="mt-3 grid gap-2 text-sm">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-md bg-white px-2 py-1">
                      <div className="text-[11px] font-semibold text-slate-900">Employee Name</div>
                      <div className="mt-0.5 text-xs text-slate-900">
                        {(() => {
                          const owner = (extraction as any)?.appointment_data?.owner;
                          if (!owner) return "—";
                          return `${owner.last_name}, ${owner.first_name}${owner.middle_name ? ' ' + owner.middle_name : ''}`;
                        })()}
                      </div>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1">
                      <div className="text-[11px] font-semibold text-slate-900">Position Title</div>
                      <div className="mt-0.5 text-xs font-semibold text-blue-700">
                        {(extraction as any)?.appointment_data?.position_title || "—"}
                      </div>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1">
                      <div className="text-[11px] font-semibold text-slate-900">Office / Department</div>
                      <div className="mt-0.5 text-xs text-slate-900">
                        {(extraction as any)?.appointment_data?.office_department || "—"}
                      </div>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1">
                      <div className="text-[11px] font-semibold text-slate-900">Salary Grade (SG)</div>
                      <div className="mt-0.5 text-xs font-semibold text-blue-700">
                        {(extraction as any)?.appointment_data?.sg ? `SG-${(extraction as any).appointment_data.sg}` : "—"}
                      </div>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1">
                      <div className="text-[11px] font-semibold text-slate-900">Monthly Salary</div>
                      <div className="mt-0.5 text-xs font-semibold text-blue-700">
                        {(() => {
                          const salary = (extraction as any)?.appointment_data?.monthly_salary;
                          if (!salary) return "—";
                          return `₱${salary.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                        })()}
                      </div>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1">
                      <div className="text-[11px] font-semibold text-slate-900">Annual Salary</div>
                      <div className="mt-0.5 text-xs text-slate-900">
                        {(() => {
                          const salary = (extraction as any)?.appointment_data?.annual_salary;
                          if (!salary) return "—";
                          return `₱${salary.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                        })()}
                      </div>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1">
                      <div className="text-[11px] font-semibold text-slate-900">Date of Signing</div>
                      <div className="mt-0.5 text-xs text-slate-900">
                        {formatIsoToDdMmYyyy((extraction as any)?.appointment_data?.appointment_date)}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Confirm & Save Button for Appointment */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3">
                  <div className="text-xs font-semibold text-blue-900">Confirm & Save to Masterlist</div>
                  <div className="mt-1 text-[11px] text-blue-800">
                    This will update the employee's Position, Office, SG, Salary, and Tenure.
                  </div>
                  <div className="mt-2">
                    <CommitEmployeePanel
                      extractionId={id}
                      initialLinkedEmployeeId={linkedEmployeeIdFromDoc}
                      owner={{
                        last_name: (extraction as any)?.appointment_data?.owner?.last_name ?? null,
                        first_name: (extraction as any)?.appointment_data?.owner?.first_name ?? null,
                        middle_name: (extraction as any)?.appointment_data?.owner?.middle_name ?? null,
                        date_of_birth: null, // Appointment forms don't have DOB
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (extraction as any)?.doc_type_final === "pds" ? (
            /* PDS: Show personal info ONLY (no job fields) */
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Personal Information (PDS)</div>
              <div className="mt-2 text-xs text-slate-600">
                PDS extracts personal details only. Job fields (Position, Office, SG, Salary) are NOT updated from PDS.
              </div>
              <div className="mt-3 grid gap-2 text-sm">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-md bg-white px-2 py-1">
                      <div className="text-[11px] font-semibold text-slate-900">Last name</div>
                      <div className="mt-0.5 text-xs text-slate-900">
                        {String((extraction as any).raw_extracted_json?.owner_candidate?.last_name ?? "—")}
                      </div>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1">
                      <div className="text-[11px] font-semibold text-slate-900">First name</div>
                      <div className="mt-0.5 text-xs text-slate-900">
                        {String((extraction as any).raw_extracted_json?.owner_candidate?.first_name ?? "—")}
                      </div>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1">
                      <div className="text-[11px] font-semibold text-slate-900">Middle name</div>
                      <div className="mt-0.5 text-xs text-slate-900">
                        {String((extraction as any).raw_extracted_json?.owner_candidate?.middle_name ?? "—")}
                      </div>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1">
                      <div className="text-[11px] font-semibold text-slate-900">Date of birth</div>
                      <div className="mt-0.5 text-xs text-slate-900">
                        {formatIsoToDdMmYyyy((extraction as any).raw_extracted_json?.owner_candidate?.date_of_birth)}
                      </div>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1">
                      <div className="text-[11px] font-semibold text-slate-900">Sex at birth</div>
                      <div className="mt-0.5 text-xs text-slate-900">
                        {String((extraction as any).raw_extracted_json?.owner_candidate?.gender ?? "—")}
                      </div>
                    </div>
                  </div>
                </div>
                
                <SexConfirm 
                  extractionId={id} 
                  canConfirm={Boolean(linkedEmployeeIdFromDoc)} 
                  initialValue={(extraction as any).raw_extracted_json?.owner_candidate?.gender || null}
                  isConfirmed={Boolean((extraction as any).raw_extracted_json?.debug?.sex?.decision)}
                />

                <CommitEmployeePanel
                  extractionId={id}
                  initialLinkedEmployeeId={linkedEmployeeIdFromDoc}
                  owner={{
                    last_name: (extraction as any).raw_extracted_json?.owner_candidate?.last_name ?? null,
                    first_name: (extraction as any).raw_extracted_json?.owner_candidate?.first_name ?? null,
                    middle_name: (extraction as any).raw_extracted_json?.owner_candidate?.middle_name ?? null,
                    date_of_birth: (extraction as any).raw_extracted_json?.owner_candidate?.date_of_birth ?? null,
                  }}
                />

                <ExtractedPhotoPanel
                  extractionId={id}
                  initialEmployeeId={linkedEmployeeIdFromDoc}
                  debugPhoto={(extraction as any).raw_extracted_json?.debug?.photo ?? null}
                />
              </div>
            </div>
          ) : (
            /* ALL OTHER TYPES: Store only, no extraction */
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Document Storage</div>
              <div className="mt-2 text-xs text-slate-600">
                This document type is stored for reference only. No structured data extraction is performed.
              </div>
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-3 text-center">
                <div className="text-xs text-slate-700">
                  Document type: <span className="font-semibold">{(extraction as any)?.doc_type_final || "Unknown"}</span>
                </div>
                <div className="mt-2 text-[11px] text-slate-500">
                  Use the Documents section below to preview and download.
                </div>
              </div>
            </div>
          )}

          {/* Only show old Owner panel for PDS (already included above) or as fallback */}
          {(extraction as any)?.doc_type_final !== "appointment" && (extraction as any)?.doc_type_final !== "pds" && (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Owner (OCR)</div>
              <div className="mt-2 grid gap-2 text-sm">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-800">No extraction available for this document type</div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Documents</div>
            <div className="mt-2 grid gap-2 text-sm">
              <div className="flex flex-col gap-2 rounded-lg bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div>
                  <div className="font-medium text-slate-900">OCR conversion</div>
                  <div className="text-xs text-slate-800">Run Google Document AI OCR and store extracted text</div>
                </div>
                <div className="self-start sm:self-auto">
                  <RunOcrButton extractionId={id} />
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-lg bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div>
                  <div className="font-medium text-slate-900">Printable export</div>
                  <div className="text-xs text-slate-800">Downloads a non-editable, printable output (image-based)</div>
                  {normalizeEnabled ? (
                    <div className="mt-1 text-[11px] text-slate-700">
                      Normalized to 8.5×13 (Legal)
                      {normDebug?.method ? ` • ${String(normDebug.method)}` : ""}
                    </div>
                  ) : (
                    <div className="mt-1 text-[11px] text-slate-700">Normalization: OFF</div>
                  )}
                </div>
                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                  <GeneratePdsPdfButton
                    extractionId={id}
                    batchId={(extraction as any)?.batch_id ? String((extraction as any).batch_id) : null}
                    documentSetId={(extraction as any)?.document_set_id ? String((extraction as any).document_set_id) : null}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-lg bg-sky-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div>
                  <div className="font-medium text-blue-900">Original upload</div>
                  <div className="text-xs text-slate-800">
                    {originalInfo ? `${originalInfo.filename} (${originalInfo.mime})` : "—"}
                  </div>
                </div>
                {originalSignedUrl ? (
                  <a
                    className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                    href={originalDownloadHref || originalSignedUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download
                  </a>
                ) : (
                  <span className="text-xs text-slate-800">No link</span>
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-lg bg-emerald-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div>
                  <div className="font-medium text-emerald-900">Searchable PDF</div>
                  <div className="text-xs text-slate-800">Generated after OCR (scan/photo + invisible text layer)</div>
                </div>
                {searchableSignedUrl ? (
                  <a
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    href={searchableDownloadHref || searchableSignedUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download searchable PDF
                  </a>
                ) : (
                  <span className="text-xs text-slate-800">No link yet (run OCR)</span>
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <div>
                  <div className="font-medium text-slate-900">Guides (blank PDS)</div>
                  <div className="text-xs text-slate-800">Open the official template to follow the correct format</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <a
                    className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                    href="/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet.pdf"
                    target="_blank"
                    rel="noreferrer"
                  >
                    PDS Guide 1
                  </a>
                  <a
                    className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                    href="/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet2.pdf"
                    target="_blank"
                    rel="noreferrer"
                  >
                    PDS Guide 2
                  </a>
                  <a
                    className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                    href="/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet3.pdf"
                    target="_blank"
                    rel="noreferrer"
                  >
                    PDS Guide 3
                  </a>
                  <a
                    className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                    href="/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet4.pdf"
                    target="_blank"
                    rel="noreferrer"
                  >
                    PDS Guide 4
                  </a>
                </div>
              </div>
            </div>
          </div>

          <DebugExtractionPanel
            rawExtractedJson={extraction.raw_extracted_json}
            documentType={(extraction as any)?.document_type}
            appointmentData={(extraction as any)?.appointment_data}
            extractionDebug={(extraction as any)?.extraction_debug}
          />

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Validated JSON (read-only MVP)</div>
            <pre className="mt-2 max-h-[400px] overflow-auto rounded-lg bg-slate-50 p-2 sm:p-3 text-xs text-slate-900">
              {JSON.stringify(extraction.validated_json, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </AppShell>
  );
}
