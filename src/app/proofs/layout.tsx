import { AuevoProviders } from "./providers";

export default function AuevoSectionLayout({ children }: LayoutProps<"/proofs">) {
  return <AuevoProviders>{children}</AuevoProviders>;
}
