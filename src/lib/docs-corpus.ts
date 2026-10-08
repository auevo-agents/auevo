import { DOC_SECTIONS, type DocBlock } from "@/app/rwa/docs/content";

function blockToText(block: DocBlock): string {
  switch (block.type) {
    case "p":
      return block.text;
    case "h2":
      return `### ${block.text}`;
    case "list":
      return block.items.map((item) => `- ${item}`).join("\n");
    case "callout":
      return `[${block.tone === "warn" ? "warning" : "note"}] ${block.text}`;
    case "table":
      return [block.headers.join(" | "), ...block.rows.map((r) => r.join(" | "))].join("\n");
  }
}

/**
 * Flattens the hand-written /docs content (src/app/docs/content.ts --
 * every fact in it is already grounded in this app's own code, per that
 * file's own header comment) into plain text for the AI concierge's
 * system prompt. This is the concierge's entire knowledge base: it is
 * never given database or RPC access, so it can only ever be as
 * accurate as this corpus -- same reasoning as content.ts itself,
 * applied one layer up.
 */
export function buildDocsCorpus(): string {
  return DOC_SECTIONS.map((section) => {
    const pages = section.pages
      .map((page) => `## ${page.title}\n${page.summary}\n\n${page.blocks.map(blockToText).join("\n\n")}`)
      .join("\n\n");
    return `# ${section.title}\n\n${pages}`;
  }).join("\n\n---\n\n");
}
