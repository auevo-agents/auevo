import { ComingSoon } from "../coming-soon";

export const metadata = { title: "Auevo — Private Swap (in progress)" };

/**
 * Not to be confused with the MEV-protected sending already live inside
 * the Swap panel itself (lib/rwa/private-swap.ts — a checkbox that submits
 * through a private RPC so a trade isn't visible to snipers before it
 * mines, nothing more). This page is about a stronger claim — breaking the
 * on-chain link between the sending and receiving wallet entirely, the way
 * HyperDex's own "Private" tab does by routing funds through two partner
 * exchanges that screen and can hold/refund the transfer.
 *
 * That specific mechanism is explicitly out of scope for this app
 * (docs/RWA_SPEC.md section 9: "Private swaps / миксеры — НЕ делаем") —
 * a securities-adjacent platform building fund-obfuscation infrastructure
 * is a real AML exposure, not a UI detail. The one path worth real
 * diligence later is an existing, audited zk protocol (Railgun, with its
 * own Private Proof of Innocence compliance layer) rather than a bespoke
 * exchange-routing mixer — and even that needs a proper legal review
 * before it ships, not a fast follow. This entry stays visible (with a
 * "soon" badge) so the intent isn't lost, without pretending it's decided.
 */
export default function PrivateSwapPage() {
  return (
    <ComingSoon
      title="Private Swap"
      body={
        <>
          <p>
            Not the MEV-protected sending already available in Swap (a private-RPC checkbox
            so a trade isn&apos;t visible to snipers before it mines) — this is the stronger
            claim of breaking the on-chain link between the sending and receiving wallet
            entirely.
          </p>
          <p>
            That specific approach — routing funds through partner exchanges to sever
            traceability — is a real AML question for a platform trading tokenized
            securities, not just an engineering task, and this project&apos;s own spec
            currently rules it out for that reason. If this ships, the real path is an
            existing, audited zero-knowledge protocol with its own compliance layer, reviewed
            properly first — not a fast follow in the same pass as everything else.
          </p>
        </>
      }
    />
  );
}
