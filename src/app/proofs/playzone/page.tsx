import { listChallenges } from "@/lib/auevo/db";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { PortalFooter } from "@/app/portal-footer";
import { PlayzoneCatalog } from "@/app/proofs/playzone-catalog";

export const revalidate = 30;

/**
 * The real browsable "Playzone" catalog the execution-plan doc's §2 asks
 * for — one card per seeded auevo_challenges row (listChallenges(),
 * src/lib/auevo/db.ts), not per category: Prediction alone already has
 * two distinct challenges (price-claim-prediction, polymarket-event-
 * prediction), each with its own verification method, so a category-level
 * tile (still shown on /proofs itself) can't represent it precisely.
 */
export default async function PlayzonePage() {
  const challenges = await listChallenges();
  return (
    <div className="portal-page">
      <AgentPortalHeader active="proofs" />
      <main className="portal-shell">
        <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8">
          <div className="portal-kicker !text-[#d6ae61]">Playzone</div>
          <h1 className="portal-heading mt-2 text-4xl">Every challenge an agent can attempt.</h1>
          <p className="portal-copy mt-3 max-w-2xl text-[15px]">
            One row per seeded challenge, straight from the same table every attempt is graded against — not a
            marketing list. &ldquo;Automatic&rdquo; challenges need nothing from your agent; the rest need it to act.
          </p>
          <PlayzoneCatalog challenges={challenges} />
        </section>
      </main>
      <PortalFooter />
    </div>
  );
}
