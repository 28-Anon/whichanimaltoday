// WhichAnimalToday — Archive List (Framer code component)
//
// Paste into a Framer code component for the Archive page. Fully
// self-contained, no dependency on the game component's code.
//
// SETUP: if Framer's starter template uses a named export instead of
// `export default`, rename this function to match.
//
// Uses the same field-journal design tokens as GameComponent.tsx —
// keep them in sync if the palette/type changes.

const ARCHIVE_JSON_URL =
  "https://raw.githubusercontent.com/28-Anon/whichanimaltoday/master/data/archive.json";

import { useEffect, useState } from "react";

interface ArchiveEntry {
  puzzleNumber: number;
  date: string;
  slug: string;
  commonName: string;
  imageUrl: string;
  funFacts: string;
  category: string;
  imageAttribution: string;
}

type LoadState = "loading" | "error" | "ready";

export default function ArchiveListComponent() {
  const [state, setState] = useState<LoadState>("loading");
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch(ARCHIVE_JSON_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: ArchiveEntry[]) => {
        if (cancelled) return;
        const sorted = [...data].sort((a, b) => b.puzzleNumber - a.puzzleNumber);
        setEntries(sorted);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.wordmark}>Archive</div>
        <div style={styles.tagline}>past specimens, already identified</div>
      </header>

      {state === "loading" && <div style={styles.statusText}>Loading past specimens…</div>}
      {state === "error" && (
        <div style={styles.statusText}>Couldn't load the archive. Please refresh.</div>
      )}
      {state === "ready" && entries.length === 0 && (
        <div style={styles.statusText}>
          No specimens archived yet — check back after day one.
        </div>
      )}

      {state === "ready" && entries.length > 0 && (
        <div style={styles.grid}>
          {entries.map((entry) => (
            <a key={entry.slug} href={`/archive/${entry.slug}`} style={styles.card}>
              <img src={entry.imageUrl} alt={entry.commonName} style={styles.thumb} />
              <div style={styles.cardName}>{entry.commonName}</div>
              <div style={styles.cardMeta}>
                #{entry.puzzleNumber} · {entry.date}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const tokens = {
  paper: "#FBF3E7",
  paperCard: "#FFFDF8",
  ink: "#2B2420",
  inkSoft: "#6B5F52",
  coral: "#E8623D",
  line: "#E3D5BE",
  display: "'Fraunces', Georgia, serif",
  body: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: tokens.body,
    background: tokens.paper,
    color: tokens.ink,
    maxWidth: 720,
    margin: "0 auto",
    padding: "24px 20px 40px",
  },
  header: {
    marginBottom: 20,
  },
  wordmark: {
    fontFamily: tokens.display,
    fontSize: 24,
    fontWeight: 600,
  },
  tagline: {
    fontFamily: tokens.mono,
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: tokens.inkSoft,
    marginTop: 2,
  },
  statusText: {
    color: tokens.inkSoft,
    textAlign: "center",
    padding: "40px 0",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: 14,
  },
  card: {
    display: "block",
    background: tokens.paperCard,
    border: `1px solid ${tokens.line}`,
    borderRadius: 6,
    padding: 8,
    textDecoration: "none",
    color: tokens.ink,
  },
  thumb: {
    width: "100%",
    aspectRatio: "1 / 1",
    objectFit: "cover",
    borderRadius: 4,
    marginBottom: 6,
    display: "block",
  },
  cardName: {
    fontFamily: tokens.body,
    fontWeight: 600,
    fontSize: 13,
  },
  cardMeta: {
    fontFamily: tokens.mono,
    fontSize: 10,
    color: tokens.inkSoft,
    marginTop: 2,
  },
};
