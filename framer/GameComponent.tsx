// WhichAnimalToday — Daily Game (Framer code component)
//
// Paste this whole file into a Framer code component. It's fully
// self-contained (engine logic inlined per docs/framer-integration.md —
// Framer's code editor doesn't reliably resolve relative imports across
// multiple pasted files).
//
// SETUP — two things to confirm once you paste this in:
// 1. Export style: this uses `export default function`. If Framer's
//    starter template for a new code component uses a named export
//    instead, rename this function to match and drop `export default`.
// 2. For the full intended look (see design notes below), add these
//    fonts in Framer's Site Settings → Fonts: "Fraunces" (display),
//    "Inter" (body), "IBM Plex Mono" (labels/numbers). The fallback
//    stacks below still look reasonable without them.
//
// DESIGN CONCEPT: a naturalist's field journal / specimen card — the
// daily animal is presented like a pinned photograph in a field log,
// with a monospace "FIELD FILE #N" catalog tag, a torn-tape photo
// corner, and a rubber-stamp "IDENTIFIED" reveal. This is the visual
// signature; keep it consistent if you extend the design.
//
// Set this once, matching scripts/runDailyArchive.ts exactly:
const LAUNCH_DATE = new Date("2026-08-01T00:00:00Z");
const ANIMALS_JSON_URL =
  "https://raw.githubusercontent.com/28-Anon/whichanimaltoday/master/data/animals.json";

import { useEffect, useState } from "react";

// ---------- Engine logic (copied from src/*.ts, kept in sync by hand) ----------

interface Animal {
  commonName: string;
  aliases: string[];
  imageUrl: string;
  hint1: string;
  hint2: string;
  hint3: string;
  funFacts: string;
  category: string;
  imageAttribution: string;
}

interface DailyResult {
  date: string;
  puzzleNumber: number;
  solved: boolean;
  guessesUsed: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDayNumber(date: Date): number {
  const utcMidnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  return Math.floor(utcMidnight / MS_PER_DAY);
}

function getDaysSinceLaunch(today: Date, launchDate: Date): number {
  return utcDayNumber(today) - utcDayNumber(launchDate);
}

function getTodayPuzzleIndex(
  today: Date,
  launchDate: Date,
  listLength: number
): number {
  const daysSinceLaunch = getDaysSinceLaunch(today, launchDate);
  return ((daysSinceLaunch % listLength) + listLength) % listLength;
}

function normalizeGuess(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

function stripTrailingS(word: string): string {
  return word.endsWith("s") && word.length > 3 ? word.slice(0, -1) : word;
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    new Array(cols).fill(0)
  );
  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[rows - 1][cols - 1];
}

function fuzzyTolerance(word: string): number {
  if (word.length <= 4) return 0;
  if (word.length <= 7) return 1;
  return 2;
}

function namesMatch(guess: string, candidate: string): boolean {
  const normalizedGuess = stripTrailingS(normalizeGuess(guess));
  const normalizedCandidate = stripTrailingS(normalizeGuess(candidate));
  if (normalizedGuess === normalizedCandidate) return true;
  const distance = levenshteinDistance(normalizedGuess, normalizedCandidate);
  return distance <= fuzzyTolerance(normalizedCandidate);
}

function checkGuess(guess: string, commonName: string, aliases: string[]): boolean {
  const candidates = [commonName, ...aliases];
  return candidates.some((candidate) => namesMatch(guess, candidate));
}

function buildShareText(
  puzzleNumber: number,
  animalEmoji: string,
  guessesUsed: number | null
): string {
  const result = guessesUsed === null ? "X/3" : `${guessesUsed}/3`;
  return `WhichAnimalToday #${puzzleNumber} ${animalEmoji} ${result}`;
}

const STORAGE_KEY = "whichanimaltoday_state";

interface StoredState {
  lastResult: DailyResult | null;
  currentStreak: number;
}

function loadState(): StoredState {
  if (typeof window === "undefined") return { lastResult: null, currentStreak: 0 };
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return { lastResult: null, currentStreak: 0 };
  try {
    return JSON.parse(raw) as StoredState;
  } catch {
    return { lastResult: null, currentStreak: 0 };
  }
}

function saveState(state: StoredState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isNextCalendarDay(previousDate: string, currentDate: string): boolean {
  const previous = new Date(`${previousDate}T00:00:00Z`);
  const current = new Date(`${currentDate}T00:00:00Z`);
  const diffDays = (current.getTime() - previous.getTime()) / MS_PER_DAY;
  return diffDays === 1;
}

function recordResult(result: DailyResult): number {
  const state = loadState();
  let newStreak: number;
  if (!result.solved) {
    newStreak = 0;
  } else if (
    state.lastResult &&
    state.lastResult.solved &&
    isNextCalendarDay(state.lastResult.date, result.date)
  ) {
    newStreak = state.currentStreak + 1;
  } else {
    newStreak = 1;
  }
  saveState({ lastResult: result, currentStreak: newStreak });
  return newStreak;
}

// Rough category → emoji lookup for the share card. Not stored per-animal
// (the data model doesn't have an emoji field) — this is a light touch,
// not meant to spoil the specific species.
const CATEGORY_EMOJI: Record<string, string> = {
  mammal: "🐾",
  bird: "🐦",
  fish: "🐟",
  reptile: "🦎",
  amphibian: "🐸",
  insect: "🐛",
  marine: "🐠",
};

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------- Component ----------

type GamePhase = "loading" | "error" | "playing" | "done";

export default function GameComponent() {
  const [phase, setPhase] = useState<GamePhase>("loading");
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [puzzleNumber, setPuzzleNumber] = useState(0);
  const [guessesLeft, setGuessesLeft] = useState(3);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [guessInput, setGuessInput] = useState("");
  const [solved, setSolved] = useState(false);
  const [streak, setStreak] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(ANIMALS_JSON_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        return res.json();
      })
      .then((animals: Animal[]) => {
        if (cancelled) return;
        if (!Array.isArray(animals) || animals.length === 0) {
          throw new Error("Animal list is empty");
        }

        const today = new Date();
        const index = getTodayPuzzleIndex(today, LAUNCH_DATE, animals.length);
        const todaysAnimal = animals[index];
        const daysSinceLaunch = getDaysSinceLaunch(today, LAUNCH_DATE);
        const puzzleNum = daysSinceLaunch + 1;

        setAnimal(todaysAnimal);
        setPuzzleNumber(puzzleNum);

        const state = loadState();
        const today8601 = todayDateString();
        if (state.lastResult && state.lastResult.date === today8601) {
          setSolved(state.lastResult.solved);
          setGuessesLeft(3 - state.lastResult.guessesUsed);
          setHintsRevealed(Math.min(state.lastResult.guessesUsed, 3));
          setStreak(state.currentStreak);
          setPhase("done");
        } else {
          setStreak(state.currentStreak);
          setPhase("playing");
        }
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function submitGuess() {
    if (!animal || guessesLeft <= 0) return;
    const trimmed = guessInput.trim();
    if (!trimmed) return;

    const correct = checkGuess(trimmed, animal.commonName, animal.aliases);
    const guessesUsedSoFar = 3 - guessesLeft;
    const newGuessesUsed = guessesUsedSoFar + 1;
    const newHintsRevealed = Math.min(newGuessesUsed, 3);

    setHintsRevealed(newHintsRevealed);
    setGuessInput("");

    if (correct) {
      finishGame(true, newGuessesUsed);
    } else if (newGuessesUsed >= 3) {
      finishGame(false, newGuessesUsed);
    } else {
      setGuessesLeft(3 - newGuessesUsed);
      setMessage("Not quite — here's another clue.");
    }
  }

  function finishGame(didSolve: boolean, guessesUsed: number) {
    const newStreak = recordResult({
      date: todayDateString(),
      puzzleNumber,
      solved: didSolve,
      guessesUsed,
    });
    setSolved(didSolve);
    setGuessesLeft(3 - guessesUsed);
    setStreak(newStreak);
    setMessage(null);
    setPhase("done");
  }

  function getShareText(): string {
    if (!animal) return "";
    const emoji = CATEGORY_EMOJI[animal.category.toLowerCase()] ?? "🐾";
    return buildShareText(puzzleNumber, emoji, solved ? 3 - guessesLeft : null);
  }

  function copyShareText() {
    const text = getShareText();
    if (!text) return;

    const markCopied = () => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    };

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(markCopied, () => {
        // Clipboard write can fail silently (permissions, unfocused
        // document, older browsers) — the visible share-text box below
        // the button is the fallback so the user always has something
        // to select and copy by hand, never a dead button.
        setShareCopied(false);
      });
    }
  }

  const hints = animal ? [animal.hint1, animal.hint2, animal.hint3] : [];

  return (
    <div style={styles.page}>
      <style>{css}</style>

      <header style={styles.header}>
        <div>
          <div style={styles.wordmark}>WhichAnimalToday</div>
          <div style={styles.tagline}>a new specimen every day</div>
        </div>
        {streak > 0 && (
          <div style={styles.streakBadge}>🔥 {streak} day{streak === 1 ? "" : "s"}</div>
        )}
      </header>

      {phase === "loading" && <div style={styles.statusText}>Loading today's specimen…</div>}

      {phase === "error" && (
        <div style={styles.statusText}>
          Couldn't load today's animal. Please refresh the page.
        </div>
      )}

      {animal && phase !== "loading" && phase !== "error" && (
        <>
          <div style={styles.photoFrame}>
            <div style={styles.tapeCorner} />
            <img
              src={animal.imageUrl}
              alt="Today's mystery animal"
              style={{
                ...styles.photo,
                filter: phase === "done" ? "none" : "none",
              }}
            />
            {phase === "done" && (
              <div style={styles.stamp}>{solved ? "IDENTIFIED" : "REVEALED"}</div>
            )}
          </div>
          <div style={styles.fileTag}>FIELD FILE #{puzzleNumber}</div>

          {phase === "playing" && (
            <>
              <div style={styles.dots}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      ...styles.dot,
                      opacity: i < guessesLeft ? 1 : 0.25,
                    }}
                  />
                ))}
                <span style={styles.dotsLabel}>{guessesLeft} guesses left</span>
              </div>

              <div style={styles.guessRow}>
                <input
                  style={styles.input}
                  type="text"
                  placeholder="what animal is this?"
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitGuess();
                  }}
                />
                <button style={styles.guessButton} onClick={submitGuess}>
                  Guess →
                </button>
              </div>

              {message && <div style={styles.message}>{message}</div>}

              {hintsRevealed > 0 && (
                <div style={styles.clues}>
                  <div style={styles.cluesLabel}>── clues ──</div>
                  {hints.slice(0, hintsRevealed).map((hint, i) => (
                    <div key={i} style={styles.clueCard}>
                      <span style={styles.cluePin}>📎</span>
                      <span style={styles.clueLabel}>Clue {i + 1}</span>
                      <span style={styles.clueText}>{hint}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {phase === "done" && (
            <div style={styles.revealCard}>
              <div style={styles.revealName}>{animal.commonName}</div>
              <div style={styles.revealFacts}>{animal.funFacts}</div>
              <div style={styles.attribution}>{animal.imageAttribution}</div>

              <div style={styles.postcard}>
                <div style={styles.postcardText}>{getShareText()}</div>
                <div style={styles.postcardHint}>tap to select and copy by hand</div>
              </div>
              <button style={styles.shareButton} onClick={copyShareText}>
                {shareCopied ? "Copied!" : "Copy result"}
              </button>

              <div style={styles.comeback}>Come back tomorrow for a new specimen.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Design tokens & styles ----------
// Palette: warm field-journal paper + coral ink + moss accent.
// Fallback font stacks work without the Framer font setup mentioned above.

const tokens = {
  paper: "#FBF3E7",
  paperCard: "#FFFDF8",
  ink: "#2B2420",
  inkSoft: "#6B5F52",
  coral: "#E8623D",
  coralDark: "#C94E2C",
  moss: "#5C7A5E",
  line: "#E3D5BE",
  display: "'Fraunces', Georgia, serif",
  body: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
};

const css = `
  @keyframes stampIn {
    0% { transform: scale(2) rotate(-8deg); opacity: 0; }
    60% { transform: scale(0.95) rotate(-8deg); opacity: 1; }
    100% { transform: scale(1) rotate(-8deg); opacity: 1; }
  }
  @keyframes slideIn {
    from { transform: translateY(8px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`;

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: tokens.body,
    background: tokens.paper,
    color: tokens.ink,
    maxWidth: 480,
    margin: "0 auto",
    padding: "24px 20px 40px",
    borderRadius: 16,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  wordmark: {
    fontFamily: tokens.display,
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: "-0.02em",
  },
  tagline: {
    fontFamily: tokens.mono,
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: tokens.inkSoft,
    marginTop: 2,
  },
  streakBadge: {
    fontFamily: tokens.mono,
    fontSize: 12,
    background: tokens.paperCard,
    border: `1px solid ${tokens.line}`,
    borderRadius: 999,
    padding: "4px 10px",
  },
  statusText: {
    fontFamily: tokens.body,
    color: tokens.inkSoft,
    textAlign: "center",
    padding: "40px 0",
  },
  photoFrame: {
    position: "relative",
    background: tokens.paperCard,
    border: `1px solid ${tokens.line}`,
    borderRadius: 4,
    padding: 10,
    boxShadow: "0 6px 16px rgba(43,36,32,0.08)",
  },
  tapeCorner: {
    position: "absolute",
    top: -8,
    left: 24,
    width: 48,
    height: 18,
    background: "rgba(232,98,61,0.35)",
    transform: "rotate(-6deg)",
    borderRadius: 2,
  },
  photo: {
    width: "100%",
    display: "block",
    borderRadius: 2,
    objectFit: "cover",
    aspectRatio: "4 / 3",
  },
  stamp: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%) rotate(-8deg)",
    fontFamily: tokens.mono,
    fontWeight: 700,
    fontSize: 28,
    letterSpacing: "0.05em",
    color: tokens.coral,
    border: `4px solid ${tokens.coral}`,
    borderRadius: 8,
    padding: "6px 18px",
    background: "rgba(255,253,248,0.85)",
    animation: "stampIn 0.4s ease-out",
  },
  fileTag: {
    fontFamily: tokens.mono,
    fontSize: 12,
    letterSpacing: "0.1em",
    color: tokens.inkSoft,
    textAlign: "center",
    margin: "10px 0 20px",
  },
  dots: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    marginBottom: 16,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: tokens.coral,
    display: "inline-block",
  },
  dotsLabel: {
    fontFamily: tokens.mono,
    fontSize: 12,
    color: tokens.inkSoft,
    marginLeft: 6,
  },
  guessRow: {
    display: "flex",
    gap: 8,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    fontFamily: tokens.body,
    fontSize: 15,
    padding: "10px 4px",
    background: "transparent",
    border: "none",
    borderBottom: `2px dashed ${tokens.line}`,
    outline: "none",
    color: tokens.ink,
  },
  guessButton: {
    fontFamily: tokens.body,
    fontWeight: 600,
    fontSize: 14,
    color: "#fff",
    background: tokens.coral,
    border: "none",
    borderRadius: 999,
    padding: "10px 18px",
    cursor: "pointer",
  },
  message: {
    fontFamily: tokens.body,
    fontSize: 13,
    color: tokens.moss,
    marginBottom: 8,
  },
  clues: {
    marginTop: 16,
  },
  cluesLabel: {
    fontFamily: tokens.mono,
    fontSize: 11,
    letterSpacing: "0.1em",
    color: tokens.inkSoft,
    textAlign: "center",
    marginBottom: 10,
  },
  clueCard: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    background: tokens.paperCard,
    border: `1px solid ${tokens.line}`,
    borderRadius: 6,
    padding: "10px 12px",
    marginBottom: 8,
    animation: "slideIn 0.25s ease-out",
  },
  cluePin: {
    fontSize: 13,
  },
  clueLabel: {
    fontFamily: tokens.mono,
    fontSize: 11,
    color: tokens.coral,
    whiteSpace: "nowrap",
  },
  clueText: {
    fontFamily: tokens.body,
    fontSize: 14,
    color: tokens.ink,
  },
  revealCard: {
    textAlign: "center",
    marginTop: 8,
  },
  revealName: {
    fontFamily: tokens.display,
    fontSize: 26,
    fontWeight: 600,
    marginBottom: 8,
  },
  revealFacts: {
    fontFamily: tokens.body,
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
    marginBottom: 16,
  },
  postcard: {
    background: tokens.paperCard,
    border: `1px dashed ${tokens.line}`,
    borderRadius: 6,
    padding: "10px 14px",
    marginBottom: 10,
    userSelect: "all",
    cursor: "text",
  },
  postcardText: {
    fontFamily: tokens.mono,
    fontSize: 13,
    color: tokens.ink,
  },
  postcardHint: {
    fontFamily: tokens.mono,
    fontSize: 10,
    color: tokens.inkSoft,
    marginTop: 4,
  },
  shareButton: {
    fontFamily: tokens.body,
    fontWeight: 600,
    fontSize: 14,
    color: "#fff",
    background: tokens.moss,
    border: "none",
    borderRadius: 999,
    padding: "10px 22px",
    cursor: "pointer",
  },
  comeback: {
    fontFamily: tokens.mono,
    fontSize: 11,
    color: tokens.inkSoft,
    marginTop: 14,
  },
};
