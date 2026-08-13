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
  "https://whichanimaltoday.whichanimaltoday.workers.dev/archive.json";

// CSSProperties is imported as a type rather than reached through a `React.`
// namespace: Framer's code editor doesn't reliably have that namespace in
// scope, so `React.CSSProperties` fails to compile on paste.
import { useEffect, useState, type CSSProperties } from "react";

interface ArchiveEntry {
  puzzleNumber: number;
  date: string;
  slug: string;
  commonName: string;
  /**
   * The specific species, where the record names one — "Long-Snouted Seahorse"
   * behind a puzzle answered "Seahorse". Optional because the archive predates
   * it: days written before the content pass carry no species at all.
   */
  species?: string;
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

/**
 * Framer sizes a code component's frame from these annotations. Without them
 * it defaults to a fixed box, which silently crops the component — that is
 * why the field journal published with its specimen cards sliced off partway
 * down, with nothing wrong in the code and no error anywhere.
 *
 * `auto` height means the frame grows to fit the content, so a journal with
 * forty entries is as tall as it needs to be. `any` width lets the frame be
 * set to Fill, instead of rendering the page in a narrow column with empty
 * space beside it.
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */
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
          {/* Suppressed when it merely repeats the common name: "Axolotl"
              under "Axolotl" reads as a bug rather than as detail. */}
          {entry.species &&
            entry.species.toLowerCase() !== entry.commonName.toLowerCase() && (
              <div style={styles.species}>{entry.species}</div>
            )}
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
    /**
     * `contain`, never `cover` — the same rule the game card follows, and for
     * the same reason. This page exists to show the photograph, so cropping it
     * to fill a landscape box removes the thing a visitor came to look at.
     *
     * It was `cover` until 2026-08-13, and the cost was measured rather than
     * guessed: 23 of the 78 photographs are narrower than 4:3, so `cover` was
     * discarding 40% of the seahorse, 50% of the giraffe on puzzle #1, and 59%
     * of the tarsier. The reveal card had carried a comment warning about
     * exactly this — "a giraffe loses its neck to a 4:3 landscape crop" — since
     * before this page was written.
     *
     * Worth knowing for the next surface that renders an animal: the audit
     * judges legibility with sharp's `fit: "contain"` specifically to mirror
     * this CSS. A page that crops is showing something the checker never saw.
     */
    objectFit: "contain",
    background: tokens.paper,
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
  species: {
    fontSize: 14,
    fontStyle: "italic",
    color: tokens.inkSoft,
    marginTop: -4,
    marginBottom: 10,
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
