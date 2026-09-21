"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

/**
 * Wallet picker — one entry per wallet extension actually installed in
 * the browser, not a single generic "Connect" button.
 *
 * wagmi's default config already runs EIP-6963 discovery (Multi Injected
 * Provider Discovery): every wallet extension that supports it —
 * MetaMask, Rabby, Coinbase Wallet, Phantom's EVM mode, OKX and most
 * others — announces itself with its own name and icon, and wagmi adds
 * each as its own connector automatically. This component's job is just
 * to list `connectors` instead of grabbing one and hiding the rest,
 * which is what a competitor's wallet picker (dapp.seranox.xyz) does too
 * and what a single "Connect wallet" button was hiding here before.
 */
export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);

  if (isConnected && address) {
    return (
      <div className="product-header-actions">
        <button className="wallet-pill" title={address}>
          <i>{address.slice(2, 3).toUpperCase()}</i>
          <span>
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
        </button>
        <button onClick={() => disconnect()}>Disconnect</button>
      </div>
    );
  }

  return (
    <>
      <button className="app-connect-button" onClick={() => setOpen(true)}>
        Connect wallet
      </button>
      {open && <WalletModal onClose={() => setOpen(false)} />}
    </>
  );
}

function WalletModal({ onClose }: { onClose: () => void }) {
  const { connectors, connect, isPending, error, variables } = useConnect();

  // The untargeted injected() fallback exists for wallets that don't
  // support EIP-6963 yet; every named, EIP-6963-announced wallet is only
  // ever listed because it is actually installed, so the generic
  // fallback is shown last rather than first.
  const sorted = [...connectors].sort((a, b) => {
    if (a.id === "injected" && b.id !== "injected") return 1;
    if (b.id === "injected" && a.id !== "injected") return -1;
    return 0;
  });

  return (
    <div className="wallet-modal-backdrop" onClick={onClose}>
      <div className="wallet-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wallet-modal-header">
          <strong>Connect wallet</strong>
          <button className="wallet-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className="wallet-modal-sub">
          Robinhood Chain · chain 4663. Non-custodial: you sign every
          transaction in your own wallet.
        </p>

        <div className="wallet-modal-list">
          {sorted.length === 0 && (
            <p className="wallet-modal-empty">
              No wallet extension detected. Install MetaMask, Rabby or
              another EIP-6963 wallet and reload.
            </p>
          )}

          {sorted.map((connector) => (
            <button
              key={connector.uid}
              className="wallet-modal-item"
              disabled={isPending}
              onClick={() => {
                connect(
                  { connector },
                  { onSuccess: onClose }
                );
              }}
            >
              {connector.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={connector.icon} alt="" width={28} height={28} />
              ) : (
                <span className="wallet-modal-icon-fallback" />
              )}
              <span>{connector.id === "injected" ? "Browser Wallet" : connector.name}</span>
              {isPending &&
                variables?.connector &&
                "uid" in variables.connector &&
                variables.connector.uid === connector.uid && (
                  <small>connecting…</small>
                )}
            </button>
          ))}
        </div>

        {error && <p className="error wallet-modal-error">{error.message}</p>}

        <p className="wallet-modal-foot">
          Don&apos;t see your wallet? Any EIP-6963 browser wallet works —
          reload the page after installing it.
        </p>
      </div>
    </div>
  );
}
