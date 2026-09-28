import {
  apiErrorResponse,
  houdiniRequest,
  isHoudiniConfigured,
  isSameOrigin,
  isValidHoudiniId,
  houdiniUserContext,
  type HoudiniOrder,
} from "@/lib/rwa/houdini-private-swap";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  if (!isHoudiniConfigured()) {
    return Response.json(
      { error: "Houdini API credentials are not configured.", configured: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: { quoteId?: unknown; addressTo?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const quoteId = body.quoteId;
  const addressTo = typeof body.addressTo === "string" ? body.addressTo.trim() : "";
  if (!isValidHoudiniId(quoteId) || addressTo.length < 10 || addressTo.length > 200) {
    return Response.json({ error: "Enter a valid destination address and refresh the quote." }, { status: 400 });
  }

  try {
    const order = await houdiniRequest<HoudiniOrder>("/v2/exchanges", {
      method: "POST",
      body: { quoteId, addressTo },
    }, houdiniUserContext(request));
    if (!order?.houdiniId || !order.depositAddress) {
      return Response.json({ error: "Houdini did not return deposit instructions. Refresh the quote." }, { status: 502 });
    }
    return Response.json({ order }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function GET(request: Request) {
  if (!isHoudiniConfigured()) {
    return Response.json(
      { error: "Houdini API credentials are not configured.", configured: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!isValidHoudiniId(id)) {
    return Response.json({ error: "Invalid order ID." }, { status: 400 });
  }
  try {
    const order = await houdiniRequest<HoudiniOrder>(`/v2/orders/${encodeURIComponent(id)}`, {}, houdiniUserContext(request));
    return Response.json({ order }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
