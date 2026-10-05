/**
 * The "automatic" Proof categories (Longevity, Economic Activity, and
 * anything else where nothing is posted or submitted) all share the same
 * gap: the page explained the mechanism in a paragraph of prose, but
 * never showed the actual pipeline — where the signal comes from, who
 * touches it, and where it ends up. One reusable schematic instead of
 * reinventing a box-and-arrow diagram per page (same visual language as
 * /credit's "How credit flows" and /credit/seats's "Structure" diagrams).
 */
function FlowBox({ title, lines, accent }: { title: string; lines: string[]; accent?: boolean }) {
  return (
    <div
      className={`flex-1 rounded-[3px] border p-3 ${
        accent ? "border-[#42d995]/35 bg-[#42d995]/[0.05]" : "border-white/[0.08] bg-white/[0.015]"
      }`}
    >
      <div className="font-medium text-[#f3eee3]">{title}</div>
      <div className="mt-1.5 flex flex-col gap-0.5 text-[#8b94a1]">
        {lines.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex shrink-0 items-center px-1 text-[#5f6875]" aria-hidden>
      →
    </div>
  );
}

export interface FlowStage {
  title: string;
  lines: string[];
  accent?: boolean;
}

export function AutomaticProofFlow({
  stages,
  takeawayHeading,
  takeawayBody,
}: {
  stages: FlowStage[];
  takeawayHeading: string;
  takeawayBody: React.ReactNode;
}) {
  return (
    <div className="mt-6 portal-panel rounded-[3px] p-6">
      <h2 className="text-sm font-medium text-[#efe9de]">How this number gets made</h2>
      <div className="mt-4 overflow-x-auto">
        <div className="flex min-w-[720px] items-stretch gap-2 text-xs">
          {stages.map((s, i) => (
            <div key={s.title} className="flex items-stretch gap-2">
              <FlowBox {...s} />
              {i < stages.length - 1 && <FlowArrow />}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6 rounded-[3px] border border-[#42d995]/25 bg-[#42d995]/[0.05] p-4">
        <h3 className="text-sm font-medium text-[#8cf0bd]">{takeawayHeading}</h3>
        <p className="mt-1.5 text-sm leading-6 text-[#aeb5bf]">{takeawayBody}</p>
      </div>
    </div>
  );
}
