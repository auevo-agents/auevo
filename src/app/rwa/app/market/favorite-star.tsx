"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { isFavorite, toggleFavorite } from "@/lib/favorites";

/** Favorites are gated behind a connected wallet — otherwise the star is shown but inert. */
export function FavoriteStar({ poolAddress }: { poolAddress: string }) {
  const { isConnected } = useAccount();

  // Lazy-initialized from localStorage — fine to differ from the SSR
  // markup for one paint, unlike state that must match server output.
  const [favorited, setFavorited] = useState(() =>
    typeof window === "undefined" ? false : isFavorite(poolAddress)
  );

  if (!isConnected) {
    return (
      <button className="favorite-star" disabled title="Connect a wallet to save favorites">
        ☆
      </button>
    );
  }

  return (
    <button
      className={favorited ? "favorite-star active" : "favorite-star"}
      title={favorited ? "Remove from favorites" : "Add to favorites"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setFavorited(toggleFavorite(poolAddress).includes(poolAddress));
      }}
    >
      {favorited ? "★" : "☆"}
    </button>
  );
}
