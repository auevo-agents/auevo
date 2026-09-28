import {
  apiErrorResponse,
  houdiniRequest,
  isHoudiniConfigured,
  houdiniUserContext,
  type HoudiniToken,
} from "@/lib/rwa/houdini-private-swap";

type TokenResponse = { tokens?: HoudiniToken[]; total?: number; totalPages?: number };

export async function GET(request: Request) {
  if (!isHoudiniConfigured()) {
    return Response.json(
      { error: "Houdini API credentials are not configured.", configured: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const incoming = new URL(request.url).searchParams;
  const term = (incoming.get("term") ?? "").trim().slice(0, 80);
  const params = new URLSearchParams({ pageSize: "20", page: "1" });
  if (term) params.set("term", term);

  try {
    const data = await houdiniRequest<TokenResponse>(`/v2/tokens?${params.toString()}`, {}, houdiniUserContext(request));
    return Response.json(
      { tokens: Array.isArray(data.tokens) ? data.tokens : [], total: data.total ?? 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
