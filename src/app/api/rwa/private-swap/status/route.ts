import { NextResponse } from "next/server";
import { isPrivateSwapConfigured } from "@/lib/rwa/private-swap";

/** Whether to even show the "Private swap" toggle — see lib/rwa/private-swap.ts's own doc comment on why this defaults to false. */
export async function GET() {
  return NextResponse.json({ configured: isPrivateSwapConfigured() });
}
