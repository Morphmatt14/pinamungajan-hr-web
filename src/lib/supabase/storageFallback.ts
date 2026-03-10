export const PRIMARY_PHOTO_BUCKET = "employee_photos";
export const FALLBACK_PHOTO_BUCKET = "hr-documents";

function looksLikeBucketNotFound(message: string) {
  const m = String(message || "").toLowerCase();
  return m.includes("bucket") && m.includes("not") && m.includes("found");
}

export async function uploadPhotoWithBucketFallback(input: {
  supabase: any;
  path: string;
  bytes: Buffer;
  contentType: string;
  upsert: boolean;
}) {
  const { supabase, path, bytes, contentType, upsert } = input;

  const attempt = async (bucket: string, objectPath: string) => {
    const { error } = await supabase.storage.from(bucket).upload(objectPath, bytes, {
      contentType,
      upsert,
    } as any);
    return { error };
  };

  const primary = await attempt(PRIMARY_PHOTO_BUCKET, path);
  if (!primary.error) {
    return { bucketUsed: PRIMARY_PHOTO_BUCKET, path, usedFallback: false, reason: null as string | null };
  }

  if (!looksLikeBucketNotFound(primary.error.message)) {
    throw new Error(primary.error.message);
  }

  // Fallback: store under a stable prefix in the existing documents bucket.
  const fallbackPath = path.startsWith("employee_photos/") ? path : `employee_photos/${path}`;
  const fallback = await attempt(FALLBACK_PHOTO_BUCKET, fallbackPath);
  if (fallback.error) {
    throw new Error(`primary_bucket_failed:${primary.error.message}; fallback_bucket_failed:${fallback.error.message}`);
  }

  return {
    bucketUsed: FALLBACK_PHOTO_BUCKET,
    path: fallbackPath,
    usedFallback: true,
    reason: `primary_bucket_missing:${PRIMARY_PHOTO_BUCKET}`,
  };
}

export async function downloadObjectAsBuffer(input: { supabase: any; bucket: string; path: string }) {
  const { supabase, bucket, path } = input;
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw new Error(error.message);
  const ab = await (data as any).arrayBuffer();
  return Buffer.from(ab);
}
