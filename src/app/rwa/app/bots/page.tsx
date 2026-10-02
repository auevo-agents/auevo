"use client";

import { useMemo, useState } from "react";
import { formatUnits, isAddress, parseUnits, type Address } from "viem";
import {
  useAccount,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { DCA_VAULT_ABI } from "@/lib/dcaVaultAbi";
import { ConnectButton } from "../connect-button";
import { TokenPickerButton, usePickableTokens } from "@/app/token-picker";

/**
 * DCA bots — recurring-buy positions, non-custodial by design: only a
 * position's own owner can ever withdraw its principal, there is no
 * admin sweep, and every scheduled buy is priced against the pool's own
 * TWAP so a keeper (anyone can be one — that's intentional, the same
 * "your escrow, a keeper only runs the strategy" model competitors on
 * this chain use) cannot fill it at a worse price than the owner's own
 * stated tolerance.
 *
 * Full write-up, test suite and static-analysis results:
 * contracts/README.md and contracts/src/DcaVault.sol in the repo.
 *
 * This page is honest about deployment status rather than pointing at a
 * placeholder address: NEXT_PUBLIC_DCA_VAULT_ADDRESS is unset until
 * someone actually runs contracts/script/deploy-dca.mjs with their own
 * key (that script is never run automatically), and the page says so
 * plainly instead of rendering a form that would fail confusingly.
 */

const VAULT_ADDRESS = process.env.NEXT_PUBLIC_DCA_VAULT_ADDRESS as
  | Address
  | undefined;

const ERC20_ABI = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export default function BotsPage() {
  return (
    <>
      <header className="product-header product-header--bots">
        <div>
          <h3>Bots</h3>
          <p>Recurring-buy (DCA) positions · non-custodial escrow</p>
        </div>
        <ConnectButton />
      </header>

      <div className="app-notice app-notice-warn">
        <strong>Experimental, reviewed, not audited.</strong> Written with
        OpenZeppelin&apos;s security primitives, TWAP-protected against sandwich
        attacks, tested (13 tests, including two reentrancy vectors) and run
        through Slither — full write-up in <code>contracts/README.md</code>.
        That is real work, not a substitute for an independent paid audit. Only
        the deposit principal you put in is ever at risk — nobody, including us,
        can withdraw it but you — but size positions as unaudited code, not
        audited code.
      </div>

      {!VAULT_ADDRESS ? (
        <div className="app-empty app-empty-text">
          <p>
            <strong>Not deployed yet.</strong> The contract is written, tested
            and statically analysed (see the notice above and the contracts/
            directory in the repo), but deploying it is a decision with
            immediate financial-security consequences — it becomes a public,
            fundable address the moment it&apos;s live. That step is
            deliberately manual: someone runs{" "}
            <code>contracts/script/deploy-dca.mjs</code> with their own key,
            from their own machine. Nothing here does it automatically.
          </p>
          <p>
            Once deployed, set <code>NEXT_PUBLIC_DCA_VAULT_ADDRESS</code> to
            bring this page live.
          </p>
        </div>
      ) : (
        <BotsApp vaultAddress={VAULT_ADDRESS} />
      )}

      <div className="app-notice">
        <strong>RWA_SPEC.md Phase 7 — recurring buy of stocks/baskets (v4/USDG).</strong>{" "}
        A second vault, <code>contracts/src/DcaVaultV4.sol</code>, ports this same
        design to Uniswap v4 + USDG for tokenized-stock/basket positions —
        written, tested (15 checks) and statically analysed, same as the vault
        above, but with one documented difference: v4 has no built-in
        historical-price oracle the way v3 does, so its anti-sandwich floor is
        weaker unless a position names a trusted on-chain price oracle (see
        that contract&apos;s own doc comment). Not deployed, and — per
        RWA_SPEC.md&apos;s own gate — not going to mainnet before an
        independent audit; this page will get its own v4 section, behind its
        own <code>NEXT_PUBLIC_DCA_VAULT_V4_ADDRESS</code> flag, once that
        happens.
      </div>
    </>
  );
}

function BotsApp({ vaultAddress }: { vaultAddress: Address }) {
  const { address: account, isConnected } = useAccount();
  const pickableTokens = usePickableTokens();

  const [tokenIn, setTokenIn] = useState("");
  const [tokenOut, setTokenOut] = useState("");
  const [fee, setFee] = useState(3000);
  const [tranche, setTranche] = useState("");
  const [intervalHours, setIntervalHours] = useState("24");
  const [principal, setPrincipal] = useState("");
  const [maxSlippageBps, setMaxSlippageBps] = useState(300);

  const validTokenIn = isAddress(tokenIn, { strict: false })
    ? (tokenIn as Address)
    : undefined;
  const validTokenOut = isAddress(tokenOut, { strict: false })
    ? (tokenOut as Address)
    : undefined;

  const tokenMeta = useReadContracts({
    allowFailure: true,
    contracts: [
      validTokenIn && {
        address: validTokenIn,
        abi: ERC20_ABI,
        functionName: "decimals",
      },
      validTokenIn && {
        address: validTokenIn,
        abi: ERC20_ABI,
        functionName: "symbol",
      },
    ].filter(Boolean) as never[],
    query: { enabled: Boolean(validTokenIn) },
  });
  const [inDecimals, inSymbol] = tokenMeta.data?.map((r) => r.result) ?? [];

  const nextId = useReadContracts({
    contracts: [
      {
        address: vaultAddress,
        abi: DCA_VAULT_ABI,
        functionName: "nextPositionId",
      },
    ],
  });
  const positionCount = Number(nextId.data?.[0]?.result ?? 0n);

  const myPositions = useReadContracts({
    allowFailure: true,
    contracts: Array.from({ length: positionCount }, (_, id) => ({
      address: vaultAddress,
      abi: DCA_VAULT_ABI,
      functionName: "positions",
      args: [BigInt(id)],
    })),
    query: { enabled: positionCount > 0 },
  });

  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const create = useWriteContract();
  const createReceipt = useWaitForTransactionReceipt({ hash: create.data });

  const parsedTranche = useMemo(() => {
    if (!tranche || typeof inDecimals !== "number") return null;
    try {
      return parseUnits(tranche, inDecimals);
    } catch {
      return null;
    }
  }, [tranche, inDecimals]);

  const parsedPrincipal = useMemo(() => {
    if (!principal || typeof inDecimals !== "number") return null;
    try {
      return parseUnits(principal, inDecimals);
    } catch {
      return null;
    }
  }, [principal, inDecimals]);

  function handleApproveAndCreate() {
    if (
      !validTokenIn ||
      !validTokenOut ||
      !parsedTranche ||
      !parsedPrincipal ||
      parsedPrincipal < parsedTranche
    ) {
      return;
    }
    approve.writeContract(
      {
        address: validTokenIn,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [vaultAddress, parsedPrincipal],
      },
      {
        onSuccess: () => {
          create.writeContract({
            address: vaultAddress,
            abi: DCA_VAULT_ABI,
            functionName: "createPosition",
            args: [
              validTokenIn,
              validTokenOut,
              fee,
              parsedTranche,
              BigInt(Math.max(1, Math.round(Number(intervalHours) * 3600))),
              maxSlippageBps,
              parsedPrincipal,
            ],
          });
        },
      },
    );
  }

  return (
    <>
      {!isConnected ? (
        <div className="app-empty">
          Connect a wallet above to create or manage a DCA position.
        </div>
      ) : (
        <div className="trade-panel">
        <div className="trade-form">
          <div className="scan-section-heading">
            <span>NEW POSITION</span>
            <strong>Recurring buy — ERC-20 into ERC-20</strong>
          </div>

          <label className="trade-field">
            <span>Spend token</span>
            <div className="trade-field-picker-row">
              <TokenPickerButton value={tokenIn} onChange={setTokenIn} tokens={pickableTokens} />
              {typeof inSymbol === "string" && <small>{inSymbol}</small>}
            </div>
          </label>

          <label className="trade-field">
            <span>Buy token</span>
            <div className="trade-field-picker-row">
              <TokenPickerButton value={tokenOut} onChange={setTokenOut} tokens={pickableTokens} />
            </div>
          </label>

          <label className="trade-field">
            <span>Pool fee tier</span>
            <select
              value={fee}
              onChange={(e) => setFee(Number(e.target.value))}
            >
              <option value={100}>0.01%</option>
              <option value={500}>0.05%</option>
              <option value={3000}>0.30%</option>
              <option value={10000}>1.00%</option>
            </select>
          </label>

          <label className="trade-field">
            <span>Amount per buy</span>
            <input
              value={tranche}
              onChange={(e) => setTranche(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
            />
          </label>

          <label className="trade-field">
            <span>Every (hours)</span>
            <input
              value={intervalHours}
              onChange={(e) => setIntervalHours(e.target.value)}
              inputMode="decimal"
            />
          </label>

          <label className="trade-field">
            <span>Total to deposit now</span>
            <input
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
            />
          </label>

          <label className="trade-field">
            <span>Max slippage vs. TWAP</span>
            <select
              value={maxSlippageBps}
              onChange={(e) => setMaxSlippageBps(Number(e.target.value))}
            >
              <option value={100}>1%</option>
              <option value={300}>3%</option>
              <option value={500}>5%</option>
              <option value={1000}>10%</option>
            </select>
          </label>

          <button
            className="app-connect-button"
            disabled={
              !parsedTranche ||
              !parsedPrincipal ||
              approve.isPending ||
              approveReceipt.isLoading ||
              create.isPending ||
              createReceipt.isLoading
            }
            onClick={handleApproveAndCreate}
          >
            {approve.isPending || approveReceipt.isLoading
              ? "Approving…"
              : create.isPending || createReceipt.isLoading
                ? "Creating position…"
                : "Approve & create position"}
          </button>

          {approve.error && <p className="error">{approve.error.message}</p>}
          {create.error && <p className="error">{create.error.message}</p>}
          {createReceipt.isSuccess && (
            <p className="trade-success">Position created.</p>
          )}
        </div>
        </div>
      )}

      <div className="app-tools">
        <div className="scan-section-heading">
          <span>ALL POSITIONS</span>
          <strong>{positionCount} total on this vault</strong>
        </div>

        {positionCount === 0 && <p className="scan-note">No positions yet.</p>}

        {myPositions.data && myPositions.data.length > 0 && (
          <div className="scan-holder-table">
            {myPositions.data.map((r, id) => {
              const pos = r.result as
                | readonly [
                    Address,
                    Address,
                    Address,
                    Address,
                    number,
                    bigint,
                    bigint,
                    bigint,
                    bigint,
                    number,
                    boolean,
                  ]
                | undefined;
              if (!pos) return null;
              const [owner, , , , , , , remaining, , , active] = pos;
              const isMine =
                account && owner.toLowerCase() === account.toLowerCase();
              return (
                <div
                  className="scan-holder-row"
                  key={id}
                  style={{ gridTemplateColumns: "40px 1fr auto auto" }}
                >
                  <span className="scan-holder-rank">#{id}</span>
                  <code className="scan-mono">
                    {owner.slice(0, 6)}…{owner.slice(-4)}
                    {isMine && " (you)"}
                  </code>
                  <span>{active ? "active" : "closed"}</span>
                  <span>{formatUnits(remaining, 18)} remaining</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
