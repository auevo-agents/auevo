import Link from "next/link";
import { notFound } from "next/navigation";
import { allDocPages, findDocPage } from "../content";
import { DocBody, headingId } from "../doc-body";

export function generateStaticParams() {
  return allDocPages().map(({ page }) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = findDocPage(slug);
  return { title: found ? `${found.page.title} — Auevo Docs` : "Auevo Docs" };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = findDocPage(slug);
  if (!found) notFound();
  const { section, page } = found;

  const flat = allDocPages();
  const index = flat.findIndex(({ page: p }) => p.slug === slug);
  const prev = index > 0 ? flat[index - 1] : null;
  const next = index < flat.length - 1 ? flat[index + 1] : null;
  const headings = page.blocks.filter((block) => block.type === "h2").map((block) => block.text);

  return (
    <div className="docs-page-grid">
      <article className="docs-article">
      <p className="docs-breadcrumb">{section.title}</p>
      <h1 className="docs-title">{page.title}</h1>
      <p className="docs-summary">{page.summary}</p>

      <DocBody blocks={page.blocks} />

      <div className="docs-pager">
        {prev ? (
          <Link href={`/docs/${prev.page.slug}`} className="docs-pager-link docs-pager-prev">
            <span>Previous</span>
            <b>{prev.page.title}</b>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`/docs/${next.page.slug}`} className="docs-pager-link docs-pager-next">
            <span>Next</span>
            <b>{next.page.title}</b>
          </Link>
        )}
      </div>
      </article>

      <aside className="docs-toc">
        <span className="docs-toc-label">On this page</span>
        {headings.map((heading) => (
          <a key={heading} href={`#${headingId(heading)}`}>{heading}</a>
        ))}
        <Link href="/app" className="docs-toc-product">
          Open in product
        </Link>
      </aside>
    </div>
  );
}
