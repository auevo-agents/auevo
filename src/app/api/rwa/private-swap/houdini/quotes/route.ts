import {
  apiErrorResponse,
  houdiniRequest,
  isHoudiniConfigured,
  houdiniUserContext,
  type HoudiniQuote,
} from "@/lib/rwa/houdini-private-swap";

type QuotesResponse = { quotes?: HoudiniQuote[] };

export async function POST(request: Request) {
  if (!isHoudiniConfigured()) {
    return Response.json(
      { error: "Houdini API credentials are not configured.", configured: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: { amount?: unknown; from?: unknown; to?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const amount = typeof body.amount === "string" || typeof body.amount === "number"
    ? String(body.amount).trim()
    : "";
  const from = typeof body.from === "string" ? body.from.trim() : "";
  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return Response.json({ error: "Enter a valid amount greater than zero." }, { status: 400 });
  }
  if (amount.length > 40 || !/^[a-zA-Z0-9_-]{6,120}$/.test(from) || !/^[a-zA-Z0-9_-]{6,120}$/.test(to) || from === to) {
    return Response.json({ error: "Choose two different supported assets." }, { status: 400 });
  }

  const params = new URLSearchParams({ amount, from, to });
  try {
    const data = await houdiniRequest<QuotesResponse>(`/v2/quotes?${params.toString()}`, {}, houdiniUserContext(request));
    const quotes = Array.isArray(data.quotes) ? data.quotes : [];
    const quote = quotes.find(
      (item) =>
        item?.type === "private" &&
        !item.error &&
        typeof item.quoteId === "string" &&
        Number(item.amountIn) > 0 &&
        Number(item.amountOut) > 0,
    );

    if (!quote) {
      return Response.json(
        { error: "No private route is available for this pair and amount. Try another asset or amount." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json({ quote }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
