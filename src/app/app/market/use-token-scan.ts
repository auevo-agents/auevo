"use client";

import { useCallback, useState } from "react";
import type { TokenScanReport } from "@/lib/token-security";

/**
 * The full scanner (POST /api/token-scan) does real work — bytecode
 * analysis, a deployment-age binary search, and a Transfer-log holder
 * scan on top of the RPC/GoPlus/Blockscout calls — easily several
 * seconds, and its own budget allows up to 60s in the worst case. Firing
 * it automatically on every token-detail page view was the single
 * biggest thing making the page feel slow, so it's on demand here:
 * nothing runs until something asks for it, and the same result is
 * shared by every consumer on the page (Token Info card, Holders tab)
 * instead of each firing its own scan.
 */
export function useTokenScan(tokenAddress: string) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [report, setReport] = useState<TokenScanReport | null>(null);

  const run = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/token-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: tokenAddress }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setReport(data);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }, [tokenAddress]);

  return { status, report, run };
}
