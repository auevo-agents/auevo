"use client";

import { useState } from "react";

/**
 * A small "copy this to clipboard" affordance — used everywhere an
 * address, contract address or tx hash is shown as truncated text, since
 * there was previously no way to get the full value out of the page short
 * of selecting text by hand (unreliable once it's been shortened with an
 * ellipsis). Safe to nest inside a clickable row/Link: stopPropagation +
 * preventDefault keep a click here from also triggering the row's own
 * navigation.
 */
export function CopyButton({ value, title }: { value: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (insecure context, denied
      // permission) — nothing useful to show the user, but never crash
      // the row it's embedded in over a copy button.
    }
  }

  return (
    <button
      type="button"
      className="copy-btn"
      onClick={handleClick}
      title={copied ? "Copied!" : (title ?? "Copy to clipboard")}
      aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
    >
      {copied ? "✓" : "⧉"}
    </button>
  );
}
