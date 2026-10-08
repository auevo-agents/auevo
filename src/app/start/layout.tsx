import { AuevoProviders } from "@/app/proofs/providers";

export default function StartLayout({ children }: LayoutProps<"/start">) {
  return <AuevoProviders>{children}</AuevoProviders>;
}
