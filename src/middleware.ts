import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = new Set<string>(["/login", "/logout", "/pending-approval"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static files from /public (logos, guides, etc.) must load without a session (e.g. login page images).
  if (/\.(png|jpg|jpeg|gif|svg|ico|webp|pdf|woff2?)$/i.test(pathname)) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/templates") ||
    pathname.startsWith("/guides") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/public")
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  let session = null;
  try {
    const {
      data: { session: s },
      error,
    } = await supabase.auth.getSession();
    if (error) {
      return response;
    }
    session = s;
  } catch {
    return response;
  }

  if (!session) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const role = String(session?.user?.app_metadata?.role || "").toLowerCase();
  const approvedFlag = session?.user?.app_metadata?.approved === true;
  const isApproved = role === "admin" || role === "hr" || approvedFlag;
  const isAdmin = role === "admin";
  if (!isApproved && !pathname.startsWith("/pending-approval")) {
    return NextResponse.redirect(new URL("/pending-approval", request.url));
  }
  if (isApproved && pathname.startsWith("/pending-approval")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (pathname.startsWith("/review") && !isAdmin) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (pathname.startsWith("/upload") && isAdmin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
