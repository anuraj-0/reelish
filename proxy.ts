import { NextResponse, type NextRequest } from "next/server";
import { recipeExists } from "@/lib/jobs/lookup";

/**
 * Recipe pages stream (Cache Components), so a notFound() inside the page can't change the
 * status from 200. Checking here, before rendering starts, lets unknown recipes return a real 404.
 * Rewriting to a path no route matches renders app/not-found.tsx with a 404 status.
 */
export function proxy(request: NextRequest) {
  const id = request.nextUrl.pathname.split("/")[2] ?? "";
  if (!recipeExists(decodeURIComponent(id))) {
    return NextResponse.rewrite(new URL("/__recipe-not-found", request.url));
  }
}

export const config = {
  matcher: ["/r/:id", "/r/:id/cook"],
};
