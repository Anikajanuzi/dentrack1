import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { createServerClient } from "@supabase/ssr";
import { blockingIssues, checkConfig, setupPageHtml } from "@/lib/config-check";

/**
 * Route protection. This is an early redirect for signed-out visitors; every page and server action
 * still re-verifies the session, and the database enforces permissions with RLS.
 */
const PUBLIC = ["/login", "/signup", "/forgot-password", "/reset-password", "/auth/callback", "/api/health"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Missing or wrong deployment settings: explain what to fix instead of failing with a bare 500.
  const problems = blockingIssues(checkConfig());
  if (problems.length) {
    if (pathname === "/api/health") return NextResponse.next({ request });
    return new NextResponse(setupPageHtml(problems), {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  let response = NextResponse.next({ request });
  let signedIn = false;

  if ((process.env.AUTH_PROVIDER ?? "supabase") === "local") {
    const token = request.cookies.get("dt_session")?.value;
    if (token && process.env.SESSION_SECRET) {
      try {
        await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET), { algorithms: ["HS256"] });
        signedIn = true;
      } catch {
        signedIn = false;
      }
    }
  } else {
    // Refreshes the Supabase session cookie on every request (standard @supabase/ssr pattern).
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    try {
      const { data } = await supabase.auth.getUser();
      signedIn = Boolean(data.user);
    } catch (e) {
      // Supabase unreachable: treat as signed out rather than failing every request.
      console.error("[dentrack] Supabase auth check failed:", e instanceof Error ? e.message : e);
      signedIn = false;
    }
  }

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  // Signed-in visitors skip the login and sign-up pages — unless the app sent them there to report a
  // problem (?error=…). Redirecting those back to the dashboard would loop forever.
  if (signedIn && (pathname === "/login" || pathname === "/signup") && !request.nextUrl.searchParams.has("error")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
