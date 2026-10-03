import { AuevoProviders } from "./providers";

export default function AuevoSectionLayout({ children }: LayoutProps<"/auevo">) {
  return <AuevoProviders>{children}</AuevoProviders>;
}
