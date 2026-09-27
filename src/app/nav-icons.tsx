/**
 * Small line-icon set for nav links — same minimalist style as HyperDex's
 * own mobile menu (a plain outline icon beside each item), not a full
 * icon library dependency for a dozen glyphs.
 */
export type NavIconKind =
  | "home"
  | "sparkle"
  | "bar-chart"
  | "building"
  | "shield"
  | "swap"
  | "line-chart"
  | "grid"
  | "lock"
  | "layers"
  | "droplet"
  | "percent"
  | "refresh"
  | "briefcase"
  | "wallet"
  | "trending-up"
  | "search"
  | "document"
  | "book";

export function NavIcon({ kind, size = 16 }: { kind: NavIconKind; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (kind) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10v9.5h13V10" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
          <path d="M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
        </svg>
      );
    case "bar-chart":
      return (
        <svg {...common}>
          <path d="M5 20V10M12 20V4M19 20v-7" />
        </svg>
      );
    case "building":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="1" />
          <path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
        </svg>
      );
    case "swap":
      return (
        <svg {...common}>
          <path d="M4 8h13M13 4l4 4-4 4" />
          <path d="M20 16H7M11 12l-4 4 4 4" />
        </svg>
      );
    case "line-chart":
      return (
        <svg {...common}>
          <path d="M4 17l5-5 4 3 7-8" />
          <path d="M4 20h16" />
        </svg>
      );
    case "grid":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="7" height="7" rx="1" />
          <rect x="13" y="4" width="7" height="7" rx="1" />
          <rect x="4" y="13" width="7" height="7" rx="1" />
          <rect x="13" y="13" width="7" height="7" rx="1" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="1.5" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case "layers":
      return (
        <svg {...common}>
          <path d="M12 3l8 4.5-8 4.5-8-4.5L12 3z" />
          <path d="M4 12.5l8 4.5 8-4.5" />
          <path d="M4 17l8 4.5L20 17" />
        </svg>
      );
    case "droplet":
      return (
        <svg {...common}>
          <path d="M12 3s6.5 7 6.5 11.5a6.5 6.5 0 1 1-13 0C5.5 10 12 3 12 3z" />
        </svg>
      );
    case "percent":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="2.5" />
          <circle cx="17" cy="17" r="2.5" />
          <path d="M18 6 6 18" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M4 12a8 8 0 0 1 14-5.3L20 9" />
          <path d="M20 4v5h-5" />
          <path d="M20 12a8 8 0 0 1-14 5.3L4 15" />
          <path d="M4 20v-5h5" />
        </svg>
      );
    case "briefcase":
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="12" rx="1.5" />
          <path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          <path d="M3 13h18" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <path d="M4 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-4" />
          <circle cx="17" cy="14" r="1.3" />
        </svg>
      );
    case "trending-up":
      return (
        <svg {...common}>
          <path d="M3 17l6-6 4 4 8-9" />
          <path d="M15 6h6v6" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      );
    case "document":
      return (
        <svg {...common}>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v4h4" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
          <path d="M4 5.5v16" />
        </svg>
      );
    default:
      return null;
  }
}
