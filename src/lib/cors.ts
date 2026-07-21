import { NextResponse } from "next/server";

/**
 * Allow Vercel frontend to call Docker worker APIs cross-origin.
 * Set CORS_ORIGIN=https://your-app.vercel.app on the worker.
 * Use * only for personal/private tools.
 */
export function corsHeaders(req?: Request): HeadersInit {
  const configured = process.env.CORS_ORIGIN?.trim();
  const requestOrigin = req?.headers.get("origin") || "";

  let allow = configured || "*";
  // If comma-separated list, pick matching origin
  if (configured && configured.includes(",")) {
    const list = configured.split(",").map((s) => s.trim());
    allow = list.includes(requestOrigin) ? requestOrigin : list[0];
  } else if (configured && configured !== "*" && requestOrigin === configured) {
    allow = requestOrigin;
  }

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function jsonWithCors(
  data: unknown,
  init?: { status?: number; req?: Request },
) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: corsHeaders(init?.req),
  });
}

export function optionsCors(req: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req),
  });
}

export function fileWithCors(
  body: BodyInit,
  init: {
    status?: number;
    headers?: Record<string, string>;
    req?: Request;
  },
) {
  return new NextResponse(body, {
    status: init.status ?? 200,
    headers: {
      ...corsHeaders(init.req),
      ...init.headers,
    },
  });
}
