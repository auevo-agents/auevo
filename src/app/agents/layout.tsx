import { AgentsProviders } from "./providers";

export default function AgentsSectionLayout({ children }: LayoutProps<"/agents">) {
  return <AgentsProviders>{children}</AgentsProviders>;
}
