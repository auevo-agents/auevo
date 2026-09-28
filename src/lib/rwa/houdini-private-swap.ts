const HOUDINI_API = "https://api-partner.houdiniswap.com";

export type HoudiniToken = {
  id: string;
  symbol: string;
  name: string;
  icon?: string;
  chainData?: { chainId?: number; shortName?: string; name?: string };
  price?: number;
};

export type HoudiniQuote = {
  quoteId: string;
  type: "private";
  swap?: string;
  swapName?: string;
  amountIn: number;
  amountOut: number;
  amountOutUsd?: number;
  duration: number;
  min?: number;
  max?: number;
  error?: string;
};

export type HoudiniOrder = {
  houdiniId: string;
  created?: string;
  expires?: string;
  depositAddress: string;
  depositTag?: string;
  receiverAddress: string;
  anonymous?: boolean;
  status: number;
  statusLabel?: string;
  inAmount: number;
  inSymbol: string;
  inStatus?: number;
  inStatusLabel?: string;
  outAmount: number;
  outSymbol: string;
  outStatus?: number;
  outStatusLabel?: string;
  eta?: number;
  swapName?: string;
  transactionHash?: string;
  hashUrl?: string;
};

export class HoudiniApiError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "HoudiniApiError";
  }
}

export function isHoudiniConfigured() {
  return Boolean(process.env.HOUDINI_API_KEY && process.env.HOUDINI_API_SECRET);
}

export type HoudiniUserContext = { ip?: string; userAgent?: string; timezone?: string };

export function houdiniUserContext(request: Request): HoudiniUserContext {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("x-real-ip")?.trim() || forwarded;
  const userAgent = request.headers.get("user-agent")?.slice(0, 500);
  const timezone = request.headers.get("x-user-timezone")?.slice(0, 80);
  return {
    ...(ip ? { ip } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(timezone ? { timezone } : {}),
  };
}

export async function houdiniRequest<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
  user?: HoudiniUserContext,
): Promise<T> {
  const key = process.env.HOUDINI_API_KEY;
  const secret = process.env.HOUDINI_API_SECRET;
  if (!key || !secret) {
    throw new HoudiniApiError("Houdini API credentials are not configured.", 503);
  }

  let response: Response;
  try {
    response = await fetch(new URL(path, HOUDINI_API), {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: `${key}:${secret}`,
        ...(user?.ip ? { "x-user-ip": user.ip } : {}),
        ...(user?.userAgent ? { "x-user-agent": user.userAgent } : {}),
        ...(user?.timezone ? { "x-user-timezone": user.timezone } : {}),
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HoudiniApiError("Houdini is temporarily unavailable. Please try again.", 502);
  }

  if (!response.ok) {
    // Do not forward raw upstream responses: they may contain provider details.
    throw new HoudiniApiError(
      response.status === 429
        ? "Houdini is busy. Please wait a moment and try again."
        : "Houdini could not complete this request. Please refresh and try again.",
      response.status === 429 ? 429 : 502,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new HoudiniApiError("Houdini returned an unreadable response.", 502);
  }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof HoudiniApiError) {
    return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(
    { error: "Houdini is temporarily unavailable. Please try again." },
    { status: 502, headers: { "Cache-Control": "no-store" } },
  );
}

export function isValidHoudiniId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,120}$/.test(value);
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
