import type { DocBlock } from "./content";

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function DocBody({ blocks }: { blocks: DocBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === "p") return <p key={i}>{block.text}</p>;
        if (block.type === "h2") {
          const id = headingId(block.text);
          return (
            <h2 key={i} id={id}>
              <a href={`#${id}`} aria-label={`Link to ${block.text}`}>#</a>
              {block.text}
            </h2>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "callout") {
          return (
            <div key={i} className={`docs-callout docs-callout-${block.tone}`}>
              {block.text}
            </div>
          );
        }
        if (block.type === "code") {
          return (
            <pre key={i} className="docs-code">
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.type === "category-grid") {
          return (
            <div className="docs-category-grid" key={i}>
              {block.items.map((item) => (
                <div className="docs-category-card" key={item.label} style={{ borderLeftColor: item.accent }}>
                  <div className="docs-category-card-head">
                    <span className="docs-category-dot" style={{ background: item.accent }} />
                    <span className="docs-category-label">{item.label}</span>
                    <span className={`docs-status-chip docs-status-chip-${item.status}`}>
                      {item.status === "live" ? "Live" : item.status === "passive" ? "Passive" : "Planned"}
                    </span>
                  </div>
                  <p className="docs-category-measures">{item.measures}</p>
                  <p className="docs-category-settles">
                    <span>Settles against</span> {item.settles}
                  </p>
                </div>
              ))}
            </div>
          );
        }
        if (block.type === "status-table") {
          return (
            <div className="docs-status-rows" key={i}>
              {block.rows.map((row, r) => (
                <div className="docs-status-row" key={r}>
                  <div className="docs-status-row-head">
                    <span className="docs-status-area">{row.area}</span>
                    <span className={`docs-status-chip docs-status-chip-${row.status}`}>
                      {row.status === "live" ? "Live" : row.status === "partial" ? "Partial" : "Planned"}
                    </span>
                  </div>
                  <div className="docs-status-row-grid">
                    <div>
                      <span className="docs-status-row-label">How it&apos;s verified / built</span>
                      <p>{row.how}</p>
                    </div>
                    <div>
                      <span className="docs-status-row-label">Who it&apos;s for</span>
                      <p>{row.who}</p>
                    </div>
                    <div>
                      <span className="docs-status-row-label">What&apos;s next</span>
                      <p>{row.next}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        }
        return (
          <div className="docs-table-wrap" key={i}>
            <table className="docs-table">
              <thead>
                <tr>
                  {block.headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}
