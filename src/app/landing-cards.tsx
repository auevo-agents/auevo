"use client";

import Link from "next/link";
import { type MouseEvent } from "react";

interface FeatureCard {
  num: string;
  title: string;
  body: string;
  tag: string;
  href: string;
}

/**
 * Tracks the cursor per-card and writes it into --mx/--my so the
 * ::before radial-gradient spotlight in globals.css (.landing2-card)
 * actually follows the pointer instead of sitting at a fixed spot —
 * the Vercel/Linear-style hover effect the user pointed at directly.
 */
function handleMouseMove(event: MouseEvent<HTMLAnchorElement>) {
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
  card.style.setProperty("--my", `${event.clientY - rect.top}px`);
}

export function LandingCards({ cards }: { cards: readonly FeatureCard[] }) {
  return (
    <div className="landing2-cards">
      {cards.map((card) => (
        <Link
          key={card.href + card.title}
          href={card.href}
          className="landing2-card"
          onMouseMove={handleMouseMove}
        >
          <span className="landing2-card-badge">{card.num}</span>
          <h4>{card.title}</h4>
          <p>{card.body}</p>
          <span className="landing2-card-arrow">
            <span className="landing2-card-dot" aria-hidden="true" />
            {card.tag} →
          </span>
        </Link>
      ))}
    </div>
  );
}
