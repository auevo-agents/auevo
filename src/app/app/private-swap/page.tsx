import type { Metadata } from "next";
import { PrivateSwapClient } from "./private-swap-client";
import styles from "./private-swap.module.css";

export const metadata: Metadata = { title: "Auevo — Private Swap" };

export default function PrivateSwapPage() {
  return (
    <>
      <header className={styles.productHeader}>
        <div>
          <h3>Private Swap</h3>
          <p>Route a swap through Houdini’s multi-hop private flow.</p>
        </div>
      </header>
      <PrivateSwapClient />
    </>
  );
}
