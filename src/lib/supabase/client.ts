import { createBrowserClient } from "@supabase/ssr";

export type SupabaseBrowserEnv = { url: string; anonKey: string };

/** Safe at render time: returns null if public env is missing (e.g. Vercel env not set). */
export function getSupabaseBrowserEnv(): SupabaseBrowserEnv | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function createSupabaseBrowserClientFromEnv(env: SupabaseBrowserEnv) {
  return createBrowserClient(env.url, env.anonKey);
}

export function createSupabaseBrowserClient() {
  const env = getSupabaseBrowserEnv();
  if (!env) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createBrowserClient(env.url, env.anonKey);
}
