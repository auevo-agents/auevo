import { GardenPreview } from "../garden/garden-preview";

export const metadata = { robots: { index: false, follow: false } };

/**
 * Visual QA only — illustrative demo agents, never linked from nav or any
 * production page. Lets the garden be checked (desktop + mobile, WebGL +
 * software fallback) without needing live Supabase data.
 */
export default function AgentsGardenPreviewPage() {
  return <GardenPreview />;
}
