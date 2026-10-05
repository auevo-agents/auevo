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
