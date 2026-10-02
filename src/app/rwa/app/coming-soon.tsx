import type { ReactNode } from "react";

/** Shared shell for a section that's a deliberate stop point, not a dead link. */
export function ComingSoon({
  title,
  body,
  heroClassName,
}: {
  title: string;
  body: ReactNode;
  heroClassName?: string;
}) {
  return (
    <>
      <header className={`product-header ${heroClassName ?? ""}`.trim()}>
        <div>
          <h3>{title}</h3>
          <p>Design stage — not deployed</p>
        </div>
      </header>

      <div className="app-empty app-empty-text">{body}</div>
    </>
  );
}
