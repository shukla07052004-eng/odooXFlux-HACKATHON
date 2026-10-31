import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

function key() {
  const secret = process.env.AUTH_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  return secret ? new TextEncoder().encode(secret) : null;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get("accessToken")?.value;
  const secret = key();
  if (!token || !secret) {
    const destination = new URL("/sign-in", request.url);
    destination.searchParams.set("next", pathname);
    return NextResponse.redirect(destination);
  }
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const role = payload.role;
    const section = pathname.split("/")[1];
    if (role === "customer" && section !== "account") return NextResponse.redirect(new URL("/account", request.url));
    if (role !== "customer" && section === "account") return NextResponse.redirect(new URL("/dashboard", request.url));
    if (role !== "admin" && section === "users") return NextResponse.redirect(new URL(role === "customer" ? "/account" : "/dashboard", request.url));
    if (role === "staff" && ["reports", "settings", "discounts"].includes(section)) return NextResponse.redirect(new URL("/dashboard", request.url));
    if (!["admin", "staff", "customer"].includes(String(role))) return NextResponse.redirect(new URL("/sign-in", request.url));
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL("/sign-in", request.url));
    response.cookies.delete("accessToken");
    return response;
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/customers/:path*", "/products/:path*", "/plans/:path*", "/quotations/:path*", "/subscriptions/:path*", "/invoices/:path*", "/payments/:path*", "/discounts/:path*", "/reports/:path*", "/settings/:path*", "/users/:path*", "/account/:path*"],
};
