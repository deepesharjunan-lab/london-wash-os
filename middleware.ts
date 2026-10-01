import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

// Runs on every request. Routes the domain's addresses, refreshes the
// Supabase auth cookie and enforces the login gate: signed-out visitors are
// bounced to /login, and a signed-in visitor hitting /login is sent
// straight to /dashboard.
export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
  const pathname = request.nextUrl.pathname;

  if (host === ROOT_DOMAIN || host === "www." + ROOT_DOMAIN) {
    if (pathname === "/") {
      return NextResponse.rewrite(new URL("/site/index.html", request.url));
    }
    if (pathname.startsWith("/site/")) return NextResponse.next();
    const url = new URL(pathname + request.nextUrl.search, `https://${subdomainFor(pathname)}.${ROOT_DOMAIN}`);
    return NextResponse.redirect(url);
  }

  if (host.endsWith("." + ROOT_DOMAIN) && pathname === "/") {
    const home = APP_SUBDOMAINS[host.slice(0, -(ROOT_DOMAIN.length + 1))];
    if (home) return NextResponse.redirect(new URL(home, request.url));
  }

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

  const path = request.nextUrl.pathname;
  // /my is the customer app and /work the staff app (each has its own sign-in
  // and session), /api/cron is the nightly job (it checks Vercel's cron
  // credentials), and the service worker, manifests and icons must load
  // before anyone signs in.
  const isCustomerApp = path === "/my" || path.startsWith("/my/");
  const isStaffApp = path === "/work" || path.startsWith("/work/");
  const isAppShell = path === "/sw.js" || path.startsWith("/manifests/") || path.startsWith("/appicon/");
  const isWebsite = path.startsWith("/site/");
  const isPublic =
    path === "/login" ||
    path.startsWith("/_next") ||
    path.startsWith("/api/public") ||
    path.startsWith("/api/cron/") ||
    isCustomerApp ||
    isStaffApp ||
    isAppShell ||
    isWebsite;

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
