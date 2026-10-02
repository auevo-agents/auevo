import { CreditProviders } from "./providers";

export default function CreditSectionLayout({ children }: LayoutProps<"/credit">) {
  return <CreditProviders>{children}</CreditProviders>;
}
