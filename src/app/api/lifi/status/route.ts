import { NextRequest, NextResponse } from "next/server";
import type { StatusResponse } from "@lifi/types";
import { lifiFetch, LifiApiError } from "@/lib/rwa/lifi/client";

export const maxDuration = 15;

/**
 * RWA_SPEC.md Phase 4's status-tracking endpoint (GET
 * https://li.quest/v1/status — path and required-param shape confirmed by
 * reading @lifi/sdk's own `dist/cjs/actions/getStatus.js`: either `txHash`
 * or `taskId` is required, `bridge`/`fromChain`/`toChain` are optional
 * extra disambiguators). Polled by the swap/bridge step overlay until the
 * response's `status` is `DONE` or `FAILED`.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const txHash = searchParams.get("txHash");
  const taskId = searchParams.get("taskId");
  if (!txHash && !taskId) {
    return NextResponse.json({ error: "txHash or taskId is required" }, { status: 400 });
  }

  const query: Record<string, string> = {};
  if (txHash) query.txHash = txHash;
  if (taskId) query.taskId = taskId;
  for (const key of ["bridge", "fromChain", "toChain"]) {
    const value = searchParams.get(key);
    if (value) query[key] = value;
  }

  try {
    const data = await lifiFetch<StatusResponse>("/status", { query });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof LifiApiError) {
      return NextResponse.json({ error: err.message, lifiBody: err.body }, { status: err.status >= 400 && err.status < 600 ? err.status : 502 });
    }
    return NextResponse.json({ error: "Could not reach LI.FI" }, { status: 502 });
  }
}
