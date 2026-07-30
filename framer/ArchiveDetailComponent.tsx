// WhichAnimalToday — Archive Detail (Framer code component)
//
// Paste into a Framer code component on a plain page whose URL is
// `archive-detail`. The slug arrives as a `?slug=` query parameter —
// `ArchiveListComponent` links to `/archive-detail?slug=<slug>`, and this
// component reads that off `window.location.search`. This is the approach
// actually in use; see docs/framer-archive-integration.md.
//
// The `slug` prop and the `resolveSlug` fallback below are retained for a
// possible future move to a `/archive/:slug` dynamic route, where Framer
// would pass the path segment as a prop. Nothing supplies that prop today,
// so the query-param path is the live one. Don't build a dynamic-route page
// on the strength of that prop existing — the archive list doesn't link to
// one.
//
// SETUP: if Framer's starter template uses a named export instead of
// `export default`, rename this function to match.

const ARCHIVE_JSON_URL =
  "https://raw.githubusercontent.com/28-Anon/whichanimaltoday/master/data/archive.json";

// CSSProperties is imported as a type rather than reached through a `React.`
// namespace: Framer's code editor doesn't reliably have that namespace in
// scope, so `React.CSSProperties` fails to compile on paste.
import { useEffect, useState, type CSSProperties } from "react";

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

type LoadState = "loading" | "error" | "not-found" | "ready";

interface Props {
  slug?: string;
}

function resolveSlug(propSlug: string | undefined): string | null {
  if (propSlug) return propSlug;
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("slug");
}

export default function ArchiveDetailComponent(props: Props) {
  const [state, setState] = useState<LoadState>("loading");
  const [entry, setEntry] = useState<ArchiveEntry | null>(null);

  useEffect(() => {
    const slug = resolveSlug(props.slug);
    if (!slug) {
      setState("not-found");
      return;
    }

    let cancelled = false;

    fetch(ARCHIVE_JSON_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: ArchiveEntry[]) => {
        if (cancelled) return;
        const found = data.find((e) => e.slug === slug) ?? null;
        setEntry(found);
        setState(found ? "ready" : "not-found");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [props.slug]);

  return (
    <div style={styles.page}>
      <a href="/archive" style={styles.backLink}>
        ← Back to archive
      </a>

      {state === "loading" && <div style={styles.statusText}>Loading…</div>}
      {state === "error" && (
        <div style={styles.statusText}>Couldn't load this entry. Please refresh.</div>
      )}
      {state === "not-found" && (
        <div style={styles.statusText}>
          This specimen doesn't exist in the archive — it may not have been
          featured yet, or the link is incorrect.
        </div>
      )}

      {state === "ready" && entry && (
        <div style={styles.card}>
          <img src={entry.imageUrl} alt={entry.commonName} style={styles.photo} />
          <div style={styles.fileTag}>FIELD FILE #{entry.puzzleNumber}</div>
          <div style={styles.name}>{entry.commonName}</div>
          <div style={styles.facts}>{entry.funFacts}</div>
          <div style={styles.attribution}>{entry.imageAttribution}</div>
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

const styles: Record<string, CSSProperties> = {
  page: {
    fontFamily: tokens.body,
    background: tokens.paper,
    color: tokens.ink,
    maxWidth: 480,
    margin: "0 auto",
    padding: "24px 20px 40px",
  },
  backLink: {
    fontFamily: tokens.mono,
    fontSize: 12,
    color: tokens.coral,
    textDecoration: "none",
    display: "inline-block",
    marginBottom: 16,
  },
  statusText: {
    color: tokens.inkSoft,
    textAlign: "center",
    padding: "40px 0",
  },
  card: {
    textAlign: "center",
  },
  photo: {
    width: "100%",
    aspectRatio: "4 / 3",
    objectFit: "cover",
    borderRadius: 4,
    border: `1px solid ${tokens.line}`,
    marginBottom: 8,
    display: "block",
  },
  fileTag: {
    fontFamily: tokens.mono,
    fontSize: 12,
    letterSpacing: "0.1em",
    color: tokens.inkSoft,
    marginBottom: 12,
  },
  name: {
    fontFamily: tokens.display,
    fontSize: 26,
    fontWeight: 600,
    marginBottom: 8,
  },
  facts: {
    fontSize: 14,
    color: tokens.inkSoft,
    lineHeight: 1.5,
    marginBottom: 10,
  },
  attribution: {
    fontFamily: tokens.mono,
    fontSize: 10,
    color: tokens.inkSoft,
    opacity: 0.8,
  },
};
