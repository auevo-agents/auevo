import { AgentPortalHeader } from "@/app/agent-portal-header";
import { getCreditPoolAddress, readSeatConfig, readAssetDecimals } from "@/lib/credit/contract";
import { PortalFooter } from "@/app/portal-footer";
import { CreditSubnav } from "../credit-subnav";
import { SeatActions } from "./seat-actions";

export const revalidate = 60;

/**
 * Explains + exposes vouchSeat() — backing an established agent with a
 * fixed-ratio lock of a separate "seat" token (intended to be $AUEVO once
 * it exists) ON TOP OF the normal real-USDG sponsor capacity vouch()
 * already requires, never instead of it. Why that ordering matters, and
 * why a naive "just burn the token" design doesn't actually protect
 * lenders, is explained inline below — it's also the whole reason this
 * isn't simply a copy of Priors' own seat mechanic (see
 * contracts/src/AgentCreditPool.sol's own doc comment for the full case).
 */
export default async function CreditSeatsPage() {
  const pool = getCreditPoolAddress();
  const seatConfig = await readSeatConfig();
  const assetDecimals = await readAssetDecimals();

  return (
    <div className="portal-page">
      <AgentPortalHeader active="credit" />

      <section className="portal-shell relative mx-auto max-w-[1100px] px-5 pt-14 pb-6 sm:px-8">
        <CreditSubnav active="seats" />

        <h1 className="portal-heading text-4xl sm:text-5xl">Seats</h1>
        <p className="mt-4 text-[var(--muted)] leading-relaxed">
          A seat backs an agent that already has a repayment track record, using a separate token — $AUEVO, once it
          exists — as an <strong className="text-[var(--ink)]">additional</strong> layer on top of a normal
          real-USDG vouch, never a replacement for it. A seat-holder earns the same 25% sponsor fee share as any
          other backer, and risks 50% of the seat token it locked (on top of its usual pool-share risk) if the
          specific loan that seat backed defaults.
        </p>
      </section>

      <section className="portal-shell relative mx-auto max-w-[1100px] px-5 pb-10 sm:px-8">
        <div className="portal-panel rounded-[3px] p-6">
          <h2 className="font-medium">Why a seat needs real USDG backing too</h2>
          <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
            Every loan is funded out of the same shared lender pool, regardless of which sponsor backs which part of
            it. For an ordinary sponsor, that&apos;s safe: their vouched capacity comes from their own deposited pool
            shares, and a default burns exactly those shares — the exact amount of real USDG that left the pool is
            offset by shrinking that sponsor&apos;s own claim, so no other lender&apos;s share price moves.
          </p>
          <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
            A seat token (like a future $AUEVO) is a completely different asset with no claim on the USDG pool at
            all. If a seat-backed default only burned that token and nothing else, the real USDG that already left
            the pool would never be offset — every lender&apos;s share price would silently drop. That would break
            this contract&apos;s one unconditional promise: a lender&apos;s principal is never at risk from an
            agent&apos;s default. So a seat requires the SAME real-USDG capacity an ordinary vouch does (deposit +
            enrollRoot, same as any sponsor), and the seat token on top is purely an added penalty and reward layer —
            see <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">contracts/src/AgentCreditPool.sol</code>
            &apos;s own doc comment for the full writeup.
          </p>
        </div>

        <div className="mt-6 portal-panel rounded-[3px] p-6">
          <h2 className="font-medium">Structure</h2>
          <div className="mt-4 overflow-x-auto">
            <div className="flex min-w-[700px] items-stretch gap-3 text-xs">
              <SchemeBox title="Agent" lines={["10+ repaid loans", "(seatEligible)"]} />
              <SchemeArrow label="gets backed by" />
              <SchemeBox title="Seat-holder" accent lines={["isRoot (real USDG deposit)", "+ locks seat token", "earns 25% fee share"]} />
              <SchemeArrow label="alongside" />
              <SchemeBox title="Ordinary sponsor(s)" lines={["same agent", "USDG-only vouch"]} />
            </div>
            <div className="mt-3 flex min-w-[700px] items-stretch gap-3 text-xs">
              <SchemeBox title="On repay" lines={["seat-holder minted pool shares", "for its own fee cut — same as", "any other sponsor"]} />
              <SchemeArrow label="vs." />
              <SchemeBox
                title="On default of the loan a seat backed"
                accent
                lines={["seat-holder's pool shares burn", "(same as an ordinary sponsor)", "+ 50% of its locked seat token burns", "+ 50% returned to it"]}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 portal-panel rounded-[3px] p-6">
          <h2 className="font-medium">Fields</h2>
          {!pool || !seatConfig.deployed ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              AgentCreditPool has not been deployed yet — see{" "}
              <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">contracts/README.md</code>.
            </p>
          ) : !seatConfig.supported ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              The currently deployed pool predates seats — it was deployed before{" "}
              <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">vouchSeat()</code> existed and has no such
              function on its bytecode. Seats need a fresh deployment of the current contract source (cheap right now:
              the pool has no activity yet) before this page can go live.
            </p>
          ) : !seatConfig.enabled ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Seats are disabled on this deployment (deployed with <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">seatToken = address(0)</code>
              ) — permanently, since this contract has no admin to turn them on later.
            </p>
          ) : (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-[var(--muted)]">
              <dt>Seat token</dt>
              <dd className="text-[var(--ink)] break-all">{seatConfig.seatToken}</dd>
              <dt>Rate</dt>
              <dd className="text-[var(--ink)]">
                {seatConfig.ratioNumerator.toString()} / {seatConfig.ratioDenominator.toString()} seat-token units per
                USDG unit vouched (fixed at deploy time, not a live price)
              </dd>
              <dt>Min repaid loans to be eligible</dt>
              <dd className="text-[var(--ink)]">{seatConfig.minRepaidLoans}</dd>
              <dt>Burned on default of the loan it backed</dt>
              <dd className="text-[var(--ink)]">{seatConfig.burnBps / 100}%</dd>
            </dl>
          )}
        </div>

        {pool && seatConfig.deployed && seatConfig.supported && seatConfig.enabled && assetDecimals !== null && (
          <div className="mt-6">
            <SeatActions
              pool={pool}
              assetDecimals={assetDecimals}
              seatTokenAddress={seatConfig.seatToken}
              seatTokenDecimals={seatConfig.seatTokenDecimals ?? 18}
            />
          </div>
        )}
      </section>
      <PortalFooter />
    </div>
  );
}

function SchemeBox({ title, lines, accent }: { title: string; lines: string[]; accent?: boolean }) {
  return (
    <div
      className={`flex-1 rounded-[3px] border p-3 ${accent ? "border-[var(--gold,#d6ae61)]/40 bg-[var(--gold,#d6ae61)]/[0.05]" : "border-[var(--line)] bg-[var(--panel-2)]"}`}
    >
      <div className="font-medium text-[var(--ink)]">{title}</div>
      <div className="mt-1.5 flex flex-col gap-0.5 text-[var(--muted)]">
        {lines.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
    </div>
  );
}

function SchemeArrow({ label }: { label: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-1 text-[var(--muted)]">
      <span>→</span>
      <span className="whitespace-nowrap">{label}</span>
    </div>
  );
}
