/**
 * Public URL for the admin UI (after sign-in). Defaults to /admin. Set NEXT_PUBLIC_ADMIN_PATH
 * (e.g. /hr-admin) to use a different path.
 * Must match middleware redirect/rewrite logic.
 */
export function getAdminPath(): string {
  const raw = (process.env.NEXT_PUBLIC_ADMIN_PATH || "/admin").trim();
  const p = raw.startsWith("/") ? raw : `/${raw}`;
  return p.replace(/\/+$/, "") || "/";
}

/** Dedicated administrator sign-in page (path is fixed, not env). */
export function getAdminLoginPath(): string {
  return "/admin/login";
}

/**
 * True when the post-login `next` path is the admin app (dashboard and sub-routes, not the admin login page).
 */
export function isAdminAppPath(pathname: string): boolean {
  const ap = getAdminPath();
  const p = (pathname || "/").split("?")[0].replace(/\/+$/, "") || "/";
  if (p === "/admin/login" || p.startsWith("/admin/login/")) return false;
  if (p === ap || p.startsWith(`${ap}/`)) return true;
  if (p === "/admin" || p.startsWith("/admin/")) return true;
  return false;
}
