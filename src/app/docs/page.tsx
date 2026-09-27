import { redirect } from "next/navigation";
import { DOC_SECTIONS } from "./content";

export default function DocsIndexPage() {
  redirect(`/docs/${DOC_SECTIONS[0].pages[0].slug}`);
}
