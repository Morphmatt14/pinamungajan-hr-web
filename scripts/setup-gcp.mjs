/**
 * GCP setup for local OCR (Application Default Credentials — no service account JSON).
 *
 * Modes:
 *   node scripts/setup-gcp.mjs              interactive
 *   node scripts/setup-gcp.mjs --yes          auto (no prompts where possible)
 *   node scripts/setup-gcp.mjs --yes --force-login   always open browser login
 *
 * Env (optional, used with --yes):
 *   GCP_PROJECT_ID, DOCUMENT_AI_LOCATION (default us), DOCUMENT_AI_PROCESSOR_ID
 *
 * First-time browser login cannot be removed — Google requires it. After that, --yes is fully automatic.
 */

import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env.local");

const GCP_KEYS = ["GCP_PROJECT_ID", "DOCUMENT_AI_LOCATION", "DOCUMENT_AI_PROCESSOR_ID"];

/**
 * If gcloud is not on PATH, try standard install locations (Windows) or GCLOUD_BIN.
 */
function resolveGcloudBinDir() {
  if (process.env.GCLOUD_BIN) {
    const full = path.resolve(process.env.GCLOUD_BIN);
    if (fs.existsSync(full)) {
      return path.dirname(full);
    }
    console.warn(`[gcloud] GCLOUD_BIN not found: ${full}`);
  }

  if (process.platform === "win32") {
    const dirs = [
      path.join(process.env.ProgramFiles || "C:\\Program Files", "Google", "Cloud SDK", "google-cloud-sdk", "bin"),
      path.join(process.env["ProgramFiles(x86)"] || "", "Google", "Cloud SDK", "google-cloud-sdk", "bin"),
      path.join(process.env.LOCALAPPDATA || "", "Google", "Cloud SDK", "google-cloud-sdk", "bin"),
    ];
    for (const d of dirs) {
      if (d && fs.existsSync(path.join(d, "gcloud.cmd"))) {
        return d;
      }
    }
  } else {
    const dirs = [
      "/usr/local/google-cloud-sdk/bin",
      "/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin",
      path.join(process.env.HOME || "", "google-cloud-sdk", "bin"),
    ];
    for (const d of dirs) {
      if (fs.existsSync(path.join(d, "gcloud"))) {
        return d;
      }
    }
  }
  return null;
}

function prependGcloudToPath() {
  const binDir = resolveGcloudBinDir();
  if (!binDir) return false;
  const exe = process.platform === "win32" ? "gcloud.cmd" : "gcloud";
  process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`;
  console.log(`[gcloud] Found SDK: ${path.join(binDir, exe)}`);
  return true;
}

function printGcloudInstallHelp() {
  console.error(`
[gcloud] Google Cloud CLI is not installed or not on PATH.

Windows — pick one:
  1) Installer: https://cloud.google.com/sdk/docs/install-sdk#windows
     After install, CLOSE this terminal and open a NEW PowerShell, then run:
       npm run setup:gcp:auto

  2) If SDK is already installed, add to PATH (example):
       C:\\Program Files\\Google\\Cloud SDK\\google-cloud-sdk\\bin

  3) Or set full path for this session only (PowerShell):
       $env:GCLOUD_BIN = "C:\\Program Files\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd"
       npm run setup:gcp:auto

Mac/Linux: https://cloud.google.com/sdk/docs/install
`);
}

function parseArgs(argv) {
  const flags = { yes: false, forceLogin: false, skipLogin: false };
  const opts = { project: "", location: "", processor: "" };
  for (const a of argv) {
    if (a === "--yes" || a === "-y") flags.yes = true;
    else if (a === "--force-login") flags.forceLogin = true;
    else if (a === "--skip-login") flags.skipLogin = true;
    else if (a.startsWith("--project=")) opts.project = a.slice("--project=".length).trim();
    else if (a.startsWith("--location=")) opts.location = a.slice("--location=".length).trim();
    else if (a.startsWith("--processor=")) opts.processor = a.slice("--processor=".length).trim();
  }
  return { flags, opts };
}

function shQuote(s) {
  if (/^[a-zA-Z0-9._-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

function run(cmd, opts = {}) {
  return spawnSync(cmd, { shell: true, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, ...opts });
}

function ensureGcloud() {
  const r = run("gcloud --version", { stdio: "pipe" });
  if (r.status !== 0) {
    printGcloudInstallHelp();
    process.exit(1);
  }
  console.log("[gcloud] OK");
}

function getGcloudProject() {
  try {
    const r = run("gcloud config get-value project", { stdio: "pipe" });
    const v = String(r.stdout || "").trim();
    return v && v !== "(unset)" ? v : "";
  } catch {
    return "";
  }
}

/** Returns true if ADC is logged in and can mint a token. */
function hasWorkingAdc() {
  try {
    execSync("gcloud auth application-default print-access-token", {
      stdio: "pipe",
      timeout: 20000,
      cwd: root,
    });
    return true;
  } catch {
    return false;
  }
}

function loadEnvFile() {
  const out = {};
  try {
    const body = fs.readFileSync(envPath, "utf8");
    for (const line of body.split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {
    /* no file */
  }
  return out;
}

function mergeEnvLocal(updates) {
  let body = "";
  try {
    body = fs.readFileSync(envPath, "utf8");
  } catch {
    body = "";
  }

  const lines = body.split(/\r?\n/);
  const keysSeen = new Set();
  const out = [];

  for (const line of lines) {
    const m = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m && Object.prototype.hasOwnProperty.call(updates, m[2])) {
      out.push(`${m[2]}=${updates[m[2]]}`);
      keysSeen.add(m[2]);
    } else {
      out.push(line);
    }
  }

  for (const k of GCP_KEYS) {
    if (updates[k] && !keysSeen.has(k)) {
      out.push(`${k}=${updates[k]}`);
    }
  }

  const trimmed = out.join("\n").replace(/\n+$/, "") + "\n";
  fs.writeFileSync(envPath, trimmed, "utf8");
  console.log(`\n[env] Updated ${envPath}`);
}

function question(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

/**
 * Try to list Document AI processors and return first processor id.
 */
function tryAutoDetectProcessor(projectId, location) {
  const loc = shQuote(location);
  const proj = shQuote(projectId);

  const attempts = [
    `gcloud ai document-processors list --location=${loc} --project=${proj} --format=json`,
    `gcloud beta ai document-processors list --location=${loc} --project=${proj} --format=json`,
    `gcloud document-ai processors list --location=${loc} --project=${proj} --format=json`,
  ];

  for (const cmd of attempts) {
    const r = run(cmd, { stdio: "pipe" });
    if (r.status !== 0 || !String(r.stdout || "").trim()) continue;
    try {
      const data = JSON.parse(r.stdout);
      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data?.processors)
          ? data.processors
          : Array.isArray(data?.response?.processors)
            ? data.response.processors
            : [];
      if (!rows.length) continue;
      for (const row of rows) {
        const name = String(row.name || row.id || "");
        const id = name.split("/").pop();
        if (id && /^[a-zA-Z0-9]+$/.test(id)) {
          console.log(`[processor] Auto-selected: ${id} (${name})`);
          return id;
        }
      }
    } catch {
      /* try next command */
    }
  }
  return "";
}

function enableApis(projectId) {
  const p = shQuote(projectId);
  console.log("\n[apis] Enabling documentai.googleapis.com + vision.googleapis.com …");
  try {
    execSync(
      `gcloud services enable documentai.googleapis.com vision.googleapis.com --project=${p}`,
      { stdio: "inherit", cwd: root }
    );
    console.log("[apis] Done.");
  } catch {
    console.warn("[apis] Enable failed (permissions?). Enable manually in APIs & Services → Library.");
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const { flags, opts } = parseArgs(argv);
  const auto = flags.yes || process.env.CI === "1" || process.env.SETUP_GCP_AUTO === "1";

  console.log("=== Pinamungajan HR — GCP setup (ADC, no JSON key) ===\n");

  prependGcloudToPath();
  ensureGcloud();

  const fileEnv = loadEnvFile();
  const envProject = process.env.GCP_PROJECT_ID || fileEnv.GCP_PROJECT_ID || "";
  const envLocation = process.env.DOCUMENT_AI_LOCATION || fileEnv.DOCUMENT_AI_LOCATION || "";
  const envProcessor = process.env.DOCUMENT_AI_PROCESSOR_ID || fileEnv.DOCUMENT_AI_PROCESSOR_ID || "";

  let projectId =
    opts.project || envProject || getGcloudProject() || "";

  const rl = auto ? null : readline.createInterface({ input: process.stdin, output: process.stdout });

  // --- Login ---
  const adcOk = hasWorkingAdc();
  if (flags.forceLogin) {
    console.log("\n[ADC] Running gcloud auth application-default login …\n");
    execSync("gcloud auth application-default login", { stdio: "inherit", cwd: root });
  } else if (flags.skipLogin) {
    console.log("[ADC] --skip-login: not running login.");
    if (!hasWorkingAdc()) {
      console.error("[ADC] No valid Application Default Credentials. Run: gcloud auth application-default login");
      process.exit(1);
    }
  } else if (adcOk) {
    console.log("[ADC] Already configured (application-default credentials OK). Skipping browser login.");
  } else if (auto) {
    console.log("\n[ADC] Not logged in. Running browser login once …\n");
    try {
      execSync("gcloud auth application-default login", { stdio: "inherit", cwd: root });
    } catch {
      console.error("\n[ADC] Login failed. Run manually:\n  gcloud auth application-default login\n");
      process.exit(1);
    }
  } else {
    const ans = (await question(rl, "Run browser login (gcloud auth application-default login)? [Y/n]: "))
      .trim()
      .toLowerCase();
    if (ans !== "n" && ans !== "no") {
      execSync("gcloud auth application-default login", { stdio: "inherit", cwd: root });
    } else if (!hasWorkingAdc()) {
      console.error("No ADC. Cannot continue without login or existing credentials.");
      rl.close();
      process.exit(1);
    }
  }

  if (!auto && rl) {
    const typed = (
      await question(
        rl,
        "GCP Project ID (Enter = gcloud default / .env): "
      )
    ).trim();
    if (typed) projectId = typed;
  }

  if (!projectId) {
    projectId = opts.project || envProject || getGcloudProject();
  }

  if (!projectId) {
    console.error(
      "\n[error] No project ID. Run: gcloud config set project YOUR_PROJECT_ID\n   Or set GCP_PROJECT_ID in .env.local / environment.\n"
    );
    if (rl) rl.close();
    process.exit(1);
  }

  execSync(`gcloud config set project ${shQuote(projectId)}`, { stdio: "inherit", cwd: root });
  console.log(`[project] ${projectId}`);

  enableApis(projectId);

  let location = opts.location || envLocation || "us";
  let processorId = opts.processor || envProcessor || "";

  if (!auto && rl) {
    const locIn = (await question(rl, `Document AI location [${location}]: `)).trim();
    if (locIn) location = locIn;
    if (!processorId) {
      const procIn = (
        await question(rl, "Document AI processor ID (Enter = try auto-detect): ")
      ).trim();
      if (procIn) processorId = procIn;
    }
  }

  if (!processorId) {
    processorId = tryAutoDetectProcessor(projectId, location);
  }

  if (!processorId) {
    console.error(
      "\n[error] Could not determine DOCUMENT_AI_PROCESSOR_ID.\n" +
        "  Create an OCR processor in Cloud Console → Document AI → Processors, then either:\n" +
        "    set DOCUMENT_AI_PROCESSOR_ID in .env.local, or\n" +
        "    run: node scripts/setup-gcp.mjs --yes --processor=YOUR_PROCESSOR_ID\n"
    );
    if (rl) rl.close();
    process.exit(1);
  }

  if (rl) rl.close();

  mergeEnvLocal({
    GCP_PROJECT_ID: projectId,
    DOCUMENT_AI_LOCATION: location,
    DOCUMENT_AI_PROCESSOR_ID: processorId,
  });

  console.log(`
Done. Next:
  • Do not set GOOGLE_APPLICATION_CREDENTIALS / GCP_SERVICE_ACCOUNT_JSON for ADC.
  • Restart: npm run dev

Fully automatic next time (after ADC exists):
  npm run setup:gcp:auto
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
