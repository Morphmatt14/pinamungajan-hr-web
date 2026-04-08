import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(process.cwd());
const envPath = path.join(root, ".env.local");
const envPathFallback = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local");

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const body = fs.readFileSync(filePath, "utf8");
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim().replace(/^\uFEFF/, "");
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function readConfig() {
  let fileEnv = parseEnvFile(envPath);
  if (!fileEnv.NEXT_PUBLIC_SUPABASE_URL || !fileEnv.SUPABASE_SERVICE_ROLE_KEY) {
    const fallbackEnv = parseEnvFile(path.resolve(envPathFallback));
    fileEnv = { ...fallbackEnv, ...fileEnv };
  }
  // Prefer .env.local values over inherited shell envs.
  const env = { ...process.env, ...fileEnv };
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const email = String(env.ADMIN_EMAIL || "admin@pinamungajan.gov.ph").trim().toLowerCase();
  const password =
    String(env.ADMIN_PASSWORD || "").trim() ||
    `Pinamungajan!${randomBytes(6).toString("hex")}A1`;
  return { url, serviceRoleKey, email, password };
}

async function main() {
  const { url, serviceRoleKey, email, password } = readConfig();
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw new Error(`listUsers failed: ${listErr.message}`);

  const existing = (listData?.users || []).find(
    (u) => String(u.email || "").toLowerCase() === email
  );

  if (existing) {
    const { error: updateErr } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      app_metadata: { ...(existing.app_metadata || {}), role: "admin", approved: true },
      email_confirm: true,
    });
    if (updateErr) throw new Error(`updateUserById failed: ${updateErr.message}`);
    console.log("Admin user updated.");
  } else {
    const { error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "admin", approved: true },
    });
    if (createErr) throw new Error(`createUser failed: ${createErr.message}`);
    console.log("Admin user created.");
  }

  console.log("\n=== ADMIN LOGIN ===");
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
  console.log("===================\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

