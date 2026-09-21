import type { ReactNode } from "react";

/** Shared shell for a section that's a deliberate stop point, not a dead link. */
export function ComingSoon({
  title,
  body,
}: {
  title: string;
  body: ReactNode;
}) {
  return (
    <>
      <header className="product-header">
        <div>
          <h3>{title}</h3>
          <p>Design stage — not deployed</p>
        </div>
      </header>

      <div className="app-empty app-empty-text">{body}</div>
    </>
  );
}
