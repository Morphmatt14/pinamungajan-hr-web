"use client";

import { useState } from "react";

export function DebugExtractionPanel({ 
  rawExtractedJson, 
  documentType, 
  appointmentData, 
  extractionDebug 
}: { 
  rawExtractedJson: any;
  documentType: string | null;
  appointmentData: any;
  extractionDebug: any;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const detectionDebug = extractionDebug?.document_detection;
  const ownerDebug = rawExtractedJson?.debug?.owner;
  const photoDebug = rawExtractedJson?.debug?.photo;
  const dobDebug = rawExtractedJson?.debug?.dob;
  const sexDebug = rawExtractedJson?.debug?.sex;

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="text-sm font-semibold text-slate-900">Debug / Diagnostics</div>
        <div className="text-xs text-slate-600">
          {isOpen ? "Hide ▼" : "Show ▶"}
        </div>
      </button>

      {isOpen && (
        <div className="mt-4 space-y-4">
          {/* Document Type Detection */}
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-900">Document Type Detection</div>
            <div className="mt-2 grid gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">Detected Type:</span>
                <span className="font-medium">{documentType || "unknown"}</span>
              </div>
              {detectionDebug && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Confidence:</span>
                    <span className="font-medium">{Math.round(detectionDebug.confidence * 100)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Stage:</span>
                    <span className="font-medium">{detectionDebug.evidence?.stage}</span>
                  </div>
                  {detectionDebug.evidence?.matched && detectionDebug.evidence.matched.length > 0 && (
                    <div>
                      <span className="text-slate-600">Matched Phrases:</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {detectionDebug.evidence.matched.map((phrase: string) => (
                          <span key={phrase} className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
                            {phrase}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {detectionDebug.evidence?.scores && (
                    <div>
                      <span className="text-slate-600">All Scores:</span>
                      <pre className="mt-1 max-h-[100px] overflow-auto rounded bg-white p-2 text-[10px]">
                        {JSON.stringify(detectionDebug.evidence.scores, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Appointment Data (if applicable) */}
          {appointmentData && (
            <div className="rounded-lg bg-green-50 p-3">
              <div className="text-xs font-semibold text-green-900">Extracted Appointment Data</div>
              <pre className="mt-2 max-h-[200px] overflow-auto rounded bg-white p-2 text-[10px]">
                {JSON.stringify(appointmentData, null, 2)}
              </pre>
            </div>
          )}

          {/* Owner Extraction */}
          {ownerDebug && (
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="text-xs font-semibold text-blue-900">Owner Extraction</div>
              <div className="mt-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Method:</span>
                  <span className="font-medium">{ownerDebug.methodUsed}</span>
                </div>
                {ownerDebug.validationReasons && ownerDebug.validationReasons.length > 0 && (
                  <div className="mt-1 text-red-600">
                    Validation Issues: {ownerDebug.validationReasons.join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Photo Extraction */}
          {photoDebug && (
            <div className="rounded-lg bg-purple-50 p-3">
              <div className="text-xs font-semibold text-purple-900">Photo Extraction</div>
              <div className="mt-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Method:</span>
                  <span className="font-medium">{photoDebug.method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Face Detected:</span>
                  <span className="font-medium">{photoDebug.faceDetected ? "Yes" : "No"}</span>
                </div>
                {photoDebug.warnings && photoDebug.warnings.length > 0 && (
                  <div className="mt-1 text-amber-600">
                    Warnings: {photoDebug.warnings.join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Date of Birth Parsing */}
          {dobDebug && (
            <div className="rounded-lg bg-amber-50 p-3">
              <div className="text-xs font-semibold text-amber-900">Date of Birth Parsing</div>
              <div className="mt-2 grid gap-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Raw:</span>
                  <span className="font-medium">{dobDebug.raw}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Parsed ISO:</span>
                  <span className="font-medium">{dobDebug.parsedIso}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Rule Used:</span>
                  <span className="font-medium">{dobDebug.parseRuleUsed}</span>
                </div>
              </div>
            </div>
          )}

          {/* Sex/Gender Detection */}
          {sexDebug && (
            <div className="rounded-lg bg-pink-50 p-3">
              <div className="text-xs font-semibold text-pink-900">Sex/Gender Detection</div>
              <div className="mt-2 grid gap-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Method:</span>
                  <span className="font-medium">{sexDebug.method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Decision:</span>
                  <span className="font-medium">{sexDebug.decision}</span>
                </div>
              </div>
            </div>
          )}

          {/* Raw Debug JSON */}
          <div className="rounded-lg bg-slate-100 p-3">
            <div className="text-xs font-semibold text-slate-900">Raw Extraction Debug</div>
            <pre className="mt-2 max-h-[300px] overflow-auto rounded bg-white p-2 text-[10px]">
              {JSON.stringify(rawExtractedJson?.debug, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
