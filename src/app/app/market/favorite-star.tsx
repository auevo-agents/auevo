"use client";

import { useState } from "react";
import { isFavorite, toggleFavorite } from "@/lib/favorites";

export function FavoriteStar({ poolAddress }: { poolAddress: string }) {
  // Lazy-initialized from localStorage — fine to differ from the SSR
  // markup for one paint, unlike state that must match server output.
  const [favorited, setFavorited] = useState(() =>
    typeof window === "undefined" ? false : isFavorite(poolAddress)
  );

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
