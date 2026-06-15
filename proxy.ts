// Next.js 16 renamed middleware → proxy. Runs on every matched request.
// Responsibilities:
//   1. Refresh the Supabase session cookie.
//   2. Gate authed pages behind a valid session.
//   3. Bounce signed-in users away from /login to their role home.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const PUBLIC_PATHS = new Set(["/login"]);

const ROLE_HOME = {
  distributor: "/distributor",
  fos: "/fos",
  retailer: "/retailer",
} as const;

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet: CookieToSet[]) => {
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.has(path);

  if (!user && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    if (path !== "/") loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  if (user && (path === "/login" || path === "/")) {
    const role =
      (user.app_metadata?.role as keyof typeof ROLE_HOME | undefined) ??
      "retailer";
    return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
  }

  return response;
}

export const config = {
  // Skip static assets, the Next internals, and favicon.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)",
  ],
};
