import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

import { isInternalTestMode } from "@/lib/runtime-mode";

function isCustomerProtectedPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/profile" ||
    pathname === "/devices" ||
    pathname === "/connect" ||
    pathname.startsWith("/connect/") ||
    pathname === "/claim" ||
    pathname === "/setup-device" ||
    pathname === "/firmware"
  );
}

function isAdminProtectedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    pathname === "/firmware/releases" ||
    pathname === "/setup"
  );
}

export default withAuth(
  function proxy(request) {
    if (isInternalTestMode()) {
      return NextResponse.next();
    }

    const { pathname, search } = request.nextUrl;

    if (
      isAdminProtectedPath(pathname) &&
      request.nextauth.token?.role !== "admin"
    ) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
      loginUrl.searchParams.set("error", "admin");
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        if (isInternalTestMode()) {
          return true;
        }

        const pathname = req.nextUrl.pathname;

        if (isCustomerProtectedPath(pathname) || isAdminProtectedPath(pathname)) {
          return Boolean(token);
        }

        return true;
      },
    },
    pages: {
      signIn: "/login",
    },
    secret: process.env.AUTH_SECRET,
  },
);

export const config = {
  matcher: [
    "/",
    "/profile",
    "/devices",
    "/connect",
    "/claim",
    "/setup-device",
    "/firmware",
    "/firmware/releases",
    "/setup",
    "/admin/:path*",
  ],
};
