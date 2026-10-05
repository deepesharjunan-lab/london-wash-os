import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { fastSession } from "@/lib/supabase/fast-session";

// The public website and each app have their own address on the domain.
// thelondonwash.com (and www) serve the static website in public/site;
// admin.* is the console, and these subdomains open straight into their app.
const ROOT_DOMAIN = "thelondonwash.com";
const APP_SUBDOMAINS: Record<string, string> = {
  pos: "/pos",
  club: "/my",
  staff: "/work",
  owner: "/owner",
};

// Which subdomain an app path belongs to, for links that land on the website domain.
function subdomainFor(path: string) {
  for (const [sub, home] of Object.entries(APP_SUBDOMAINS)) {
    if (path === home || path.startsWith(home + "/")) return sub;
  }
  return "admin";
}

// Runs on every request. Routes the domain's addresses, enforces the console
// login gate (signed-out visitors go to /login, a signed-in visitor hitting
// /login goes to /dashboard) and refreshes the Supabase auth cookie when it is
// about to expire. Normal clicks verify the token locally (lib/supabase/fast-session.ts);
// only expiring or unusual tokens take the full Supabase check.
export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
  const pathname = request.nextUrl.pathname;

  if (host === ROOT_DOMAIN || host === "www." + ROOT_DOMAIN) {
    if (pathname === "/") {
      return NextResponse.rewrite(new URL("/site/index.html", request.url));
    }
    if (pathname === "/privacy") {
      return NextResponse.rewrite(new URL("/site/privacy.html", request.url));
    }
    if (pathname.startsWith("/site/") || pathname.startsWith("/api/public/")) return NextResponse.next();
    const url = new URL(pathname + request.nextUrl.search, `https://${subdomainFor(pathname)}.${ROOT_DOMAIN}`);
    return NextResponse.redirect(url);
  }

  if (host.endsWith("." + ROOT_DOMAIN) && pathname === "/") {
    const home = APP_SUBDOMAINS[host.slice(0, -(ROOT_DOMAIN.length + 1))];
    if (home) return NextResponse.redirect(new URL(home, request.url));
  }

  const path = request.nextUrl.pathname;
  // /my is the customer app and /work the staff app (each has its own sign-in
  // and session), /i/<code> is a customer's online invoice, /api/cron is the nightly job (it checks Vercel's cron
  // credentials), and the service worker, manifests and icons must load
  // before anyone signs in.
  const isCustomerApp = path === "/my" || path.startsWith("/my/");
  const isStaffApp = path === "/work" || path.startsWith("/work/");
  const isAppShell = path === "/sw.js" || path.startsWith("/manifests/") || path.startsWith("/appicon/");
  const isWebsite = path.startsWith("/site/");
  const isInvoiceLink = path.startsWith("/i/"); // private online invoice, opened from WhatsApp (signed link)
  const isPublic =
    path === "/login" ||
    path.startsWith("/_next") ||
    path.startsWith("/api/public") ||
    path.startsWith("/api/cron/") ||
    isCustomerApp ||
    isStaffApp ||
    isAppShell ||
    isWebsite ||
    isInvoiceLink;

  // Public pages don't use the console sign-in, so skip it entirely.
  if (isPublic && path !== "/login") return NextResponse.next();

  // Fast path: verify the console sign-in token locally (no call to Supabase).
  const fast = await fastSession(request);
  if (fast.state === "none") {
    if (path === "/login") return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (fast.state === "valid") {
    if (path === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Full check (token about to expire, or anything unusual): asks Supabase and refreshes the cookie.
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
