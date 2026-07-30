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

// SET THIS ON LAUNCH DAY, at the same time as LAUNCH_DATE above.
// It is appended to the copied share text on its own line, so a friend who
// receives "WhichAnimalToday #12 🐾 2/3" can actually reach the game.
// Sharing is the primary growth mechanic, so an unset value here is a real
// cost — but a blank line in every shared result would be worse, so the
// empty string simply omits the line until you fill it in.
const SITE_URL = "";

const HOW_TO_PLAY: { heading: string; body: string }[] = [
  {
    heading: "One animal a day.",
    body:
      "Every day, WhichAnimalToday features one new specimen — a photo, waiting to be identified.",
  },
  {
    heading: "1. Look at the photo.",
    body: "No caption, no name — just the picture. What do you think it is?",
  },
  {
    heading: "2. Take your guess.",
    body:
      "Type an animal name and hit \"Guess →\". Common names, scientific names, and close spellings all count — you don't need to nail the exact wording.",
  },
  {
    heading: "3. Get a clue either way.",
    body:
      "Right or wrong, each guess reveals a new clue — starting tricky, ending almost-a-giveaway. You get 3 guesses total.",
  },
  {
    heading: "4. See the reveal.",
    body:
      "Once you guess it — or run out of guesses — the full answer shows up, along with a fun fact and where the photo came from.",
  },
  {
    heading: "5. Share your result.",
    body:
      "Copy your result (something like `WhichAnimalToday #12 🐢 2/3`) and send it to a friend. No spoilers — just your score.",
  },
  {
    heading: "Come back tomorrow",
    body:
      "for a brand new specimen. Miss a day and your streak resets, so try to make it a habit.",
  },
];

// Types are imported explicitly rather than reached through a `React.`
// namespace: Framer's code editor doesn't reliably have that namespace in
// scope, so `React.CSSProperties` can fail to compile on paste.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

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
  guessesUsed: number | null,
  siteUrl?: string
): string {
  const result = guessesUsed === null ? "X/3" : `${guessesUsed}/3`;
  const scoreLine = `WhichAnimalToday #${puzzleNumber} ${animalEmoji} ${result}`;

  // The URL is what makes a shared result findable — without it a recipient
  // has a score and no way to reach the game. Optional so the pre-launch
  // state (constant present but not yet set) doesn't append a blank line.
  const trimmedUrl = siteUrl?.trim();
  return trimmedUrl ? `${scoreLine}\n${trimmedUrl}` : scoreLine;
}

const STORAGE_KEY = "whichanimaltoday_state";
const SCHEMA_VERSION = 2;

interface StoredStateV2 {
  version: 2;
  history: DailyResult[];
}

interface Stats {
  played: number;
  wins: number;
  winPercent: number;
  currentStreak: number;
  maxStreak: number;
  distribution: [number, number, number];
}

const EMPTY_STATS: Stats = {
  played: 0,
  wins: 0,
  winPercent: 0,
  currentStreak: 0,
  maxStreak: 0,
  distribution: [0, 0, 0],
};

function emptyState(): StoredStateV2 {
  return { version: SCHEMA_VERSION, history: [] };
}

/**
 * A malformed entry (e.g. `null`, or missing/mistyped fields) would
 * otherwise pass the `Array.isArray` check below and then throw later
 * inside `computeStats` (`a.date.localeCompare`) — which lands in the
 * fetch `.then` chain here and is swallowed by `.catch(() =>
 * setPhase("error"))`, bricking the game on every load thereafter since
 * nothing ever clears the bad stored value. Filtering here lets a corrupt
 * value self-heal instead. Kept in sync by hand with src/gameState.ts.
 */
function isWellFormedEntry(entry: unknown): entry is DailyResult {
  if (typeof entry !== "object" || entry === null) return false;
  const candidate = entry as Partial<DailyResult>;
  return (
    typeof candidate.date === "string" &&
    typeof candidate.solved === "boolean" &&
    typeof candidate.guessesUsed === "number"
  );
}

function loadState(): StoredStateV2 {
  if (typeof window === "undefined") return emptyState();

  let raw: string | null;
  try {
    // The `window.localStorage` property access itself can raise when
    // cookies are blocked — it must be inside the try, not before it.
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return emptyState();
  }
  if (!raw) return emptyState();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyState();
  }
  if (typeof parsed !== "object" || parsed === null) return emptyState();

  const candidate = parsed as {
    version?: number;
    history?: unknown;
    lastResult?: DailyResult | null;
  };

  if (candidate.version === SCHEMA_VERSION) {
    return Array.isArray(candidate.history)
      ? {
          version: SCHEMA_VERSION,
          history: (candidate.history as unknown[]).filter(isWellFormedEntry),
        }
      : emptyState();
  }

  // v1 -> v2. `currentStreak` is deliberately dropped; see the design doc
  // at docs/superpowers/specs/2026-07-29-stats-and-shell-design.md §2.
  if ("lastResult" in candidate) {
    const last = candidate.lastResult;
    return { version: SCHEMA_VERSION, history: last ? [last] : [] };
  }

  return emptyState();
}

function saveState(state: StoredStateV2): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked or full. The game continues; the result just won't
    // survive a reload, and stats stay at zero. See the plan's Global
    // Constraints.
  }
}

function dayNumber(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / MS_PER_DAY);
}

function computeStats(history: DailyResult[], today: string): Stats {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));

  const played = sorted.length;
  const wins = sorted.filter((entry) => entry.solved).length;
  const winPercent = played === 0 ? 0 : Math.round((wins / played) * 100);

  const distribution: [number, number, number] = [0, 0, 0];
  for (const entry of sorted) {
    if (entry.solved && entry.guessesUsed >= 1 && entry.guessesUsed <= 3) {
      distribution[entry.guessesUsed - 1] += 1;
    }
  }

  let maxStreak = 0;
  let run = 0;
  let previous: DailyResult | null = null;
  for (const entry of sorted) {
    if (!entry.solved) {
      run = 0;
    } else if (
      previous !== null &&
      previous.solved &&
      dayNumber(entry.date) - dayNumber(previous.date) === 1
    ) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > maxStreak) maxStreak = run;
    previous = entry;
  }

  let currentStreak = 0;
  const last = played === 0 ? null : sorted[played - 1];
  if (last !== null && last.solved) {
    const gap = dayNumber(today) - dayNumber(last.date);
    if (gap === 0 || gap === 1) currentStreak = run;
  }

  return { played, wins, winPercent, currentStreak, maxStreak, distribution };
}

function recordResult(result: DailyResult): Stats {
  const history = loadState().history.filter(
    (entry) => entry.date !== result.date
  );
  history.push(result);
  history.sort((a, b) => a.date.localeCompare(b.date));
  saveState({ version: SCHEMA_VERSION, history });
  return computeStats(history, result.date);
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

function Modal({
  title,
  open,
  footer,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  footer?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Remember what had focus before the panel opened, so it can be
    // restored on close — otherwise focus falls to <body> when this
    // panel's contents unmount, and a keyboard user loses their place.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the panel so keyboard and screen-reader users land
    // here rather than continuing through the page behind it.
    cardRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      // Guard against the trigger having been removed from the DOM or no
      // longer being focusable in the meantime.
      if (
        previouslyFocused &&
        typeof previouslyFocused.focus === "function" &&
        document.body.contains(previouslyFocused)
      ) {
        previouslyFocused.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={styles.modalBackdrop}
      onClick={(event) => {
        // Only a click that genuinely originated on the backdrop itself
        // should close the panel. Without this check, drag-selecting the
        // share postcard's `userSelect: "all"` text and releasing the
        // mouse outside the card fires a click on the backdrop (the click
        // target follows mouseup, not mousedown) and dismisses the panel
        // mid-copy.
        if (event.target === event.currentTarget) onClose();
      }}
      data-testid="modal-backdrop"
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={styles.modalCard}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>{title}</div>
          <button
            type="button"
            aria-label="Close"
            style={styles.modalClose}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div style={styles.modalBody}>{children}</div>
        {footer && <div style={styles.modalFooter}>{footer}</div>}
      </div>
    </div>
  );
}

function StatsPanel({
  stats,
  todayGuesses,
}: {
  stats: Stats;
  todayGuesses: number | null;
}) {
  if (stats.played === 0) {
    return <div style={styles.statsEmpty}>No specimens identified yet.</div>;
  }

  const largest = Math.max(...stats.distribution);

  return (
    <>
      <div style={styles.statsRow}>
        {[
          { label: "Played", value: stats.played },
          { label: "Win %", value: stats.winPercent },
          { label: "Current", value: stats.currentStreak },
          { label: "Max", value: stats.maxStreak },
        ].map((figure) => (
          <div key={figure.label} style={styles.statsFigure}>
            <div style={styles.statsValue}>{figure.value}</div>
            <div style={styles.statsLabel}>{figure.label}</div>
          </div>
        ))}
      </div>

      <div style={styles.distTitle}>Guess distribution</div>
      {stats.distribution.map((count, index) => {
        const guessNumber = index + 1;
        // When every game has been lost, `largest` is 0 and a
        // proportional width would divide by zero — fall back to a fixed
        // minimum so the bars still render.
        const width = largest === 0 ? 6 : Math.max(6, (count / largest) * 100);
        const highlighted = todayGuesses === guessNumber;
        return (
          <div key={guessNumber} style={styles.distRow}>
            <span style={styles.distIndex}>{guessNumber}</span>
            <span
              style={{
                ...styles.distBar,
                width: `${width}%`,
                background: highlighted ? tokens.coral : tokens.moss,
              }}
            />
            <span style={styles.distCount}>{count}</span>
          </div>
        );
      })}
    </>
  );
}

type GamePhase = "loading" | "error" | "playing" | "done";

export default function GameComponent() {
  const [phase, setPhase] = useState<GamePhase>("loading");
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [puzzleNumber, setPuzzleNumber] = useState(0);
  const [guessesLeft, setGuessesLeft] = useState(3);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [guessInput, setGuessInput] = useState("");
  const [solved, setSolved] = useState(false);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [message, setMessage] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [openPanel, setOpenPanel] = useState<"stats" | "howto" | null>(null);

  const closePanel = useCallback(() => setOpenPanel(null), []);

  // Stats come from localStorage alone and have nothing to do with the
  // network — read them on mount independent of the animals fetch below,
  // so the Statistics panel reflects the player's real history even while
  // that fetch is slow, rejects, or 404s. See fix 2 of the branch review.
  useEffect(() => {
    const state = loadState();
    setStats(computeStats(state.history, todayDateString()));
  }, []);

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

        const todayEntry = state.history.find(
          (entry) => entry.date === today8601
        );
        if (todayEntry) {
          setSolved(todayEntry.solved);
          setGuessesLeft(3 - todayEntry.guessesUsed);
          setHintsRevealed(Math.min(todayEntry.guessesUsed, 3));
          setPhase("done");
        } else {
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
    const newStats = recordResult({
      date: todayDateString(),
      puzzleNumber,
      solved: didSolve,
      guessesUsed,
    });
    setSolved(didSolve);
    setGuessesLeft(3 - guessesUsed);
    setStats(newStats);
    setMessage(null);
    setPhase("done");
  }

  function getShareText(): string {
    if (!animal) return "";
    const emoji = CATEGORY_EMOJI[animal.category.toLowerCase()] ?? "🐾";
    return buildShareText(
      puzzleNumber,
      emoji,
      solved ? 3 - guessesLeft : null,
      SITE_URL
    );
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

  // `puzzleNumber` defaults to 0 until the animals fetch resolves. Now that
  // stats load independently of that fetch, a player can open a panel
  // before it does — omit the footer rather than showing a meaningless
  // "FIELD FILE #0".
  const fieldFileFooter =
    puzzleNumber > 0 ? `FIELD FILE #${puzzleNumber}` : undefined;

  return (
    <div style={styles.page}>
      <style>{css}</style>

      <header style={styles.header}>
        <div>
          <div style={styles.wordmark}>WhichAnimalToday</div>
          <div style={styles.tagline}>a new specimen every day</div>
        </div>
        <div style={styles.headerControls}>
          {stats.currentStreak > 0 && (
            <div style={styles.streakBadge}>
              🔥 {stats.currentStreak} day{stats.currentStreak === 1 ? "" : "s"}
            </div>
          )}
          <button
            type="button"
            aria-label="Statistics"
            style={styles.iconTab}
            onClick={() => setOpenPanel("stats")}
          >
            <span aria-hidden="true">📊</span>
          </button>
          <button
            type="button"
            aria-label="How to play"
            style={styles.iconTab}
            onClick={() => setOpenPanel("howto")}
          >
            <span aria-hidden="true">❓</span>
          </button>
          <a href="/archive" style={styles.archivePill}>
            Play the Archive →
          </a>
        </div>
      </header>

      <Modal
        title="Statistics"
        open={openPanel === "stats"}
        footer={fieldFileFooter}
        onClose={closePanel}
      >
        <StatsPanel
          stats={stats}
          todayGuesses={phase === "done" && solved ? 3 - guessesLeft : null}
        />
        {phase === "done" && (
          <>
            <div style={styles.postcard}>
              <div style={styles.postcardText}>{getShareText()}</div>
              <div style={styles.postcardHint}>tap to select and copy by hand</div>
            </div>
            <button style={styles.shareButton} onClick={copyShareText}>
              {shareCopied ? "Copied!" : "Copy result"}
            </button>
          </>
        )}
      </Modal>

      <Modal
        title="How to Play"
        open={openPanel === "howto"}
        footer={fieldFileFooter}
        onClose={closePanel}
      >
        {HOW_TO_PLAY.map((section) => (
          <div key={section.heading} style={styles.howtoSection}>
            <span style={styles.howtoHeading}>{section.heading}</span>{" "}
            <span style={styles.howtoBody}>{section.body}</span>
          </div>
        ))}
        <a href="/archive" style={styles.howtoLink}>
          Browse the Archive →
        </a>
      </Modal>

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

              <a href="/archive" style={styles.archiveCard}>
                <span style={styles.archiveCardTitle}>
                  Missed a day? Play the Archive →
                </span>
                <span style={styles.archiveCardBody}>
                  Every specimen featured so far, still playable.
                </span>
              </a>
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

const styles: Record<string, CSSProperties> = {
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
  headerControls: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  iconTab: {
    fontSize: 14,
    lineHeight: 1,
    background: tokens.paperCard,
    border: `1px solid ${tokens.line}`,
    borderRadius: 6,
    padding: "6px 8px",
    cursor: "pointer",
    color: tokens.ink,
  },
  archivePill: {
    fontFamily: tokens.body,
    fontWeight: 600,
    fontSize: 12,
    color: "#fff",
    background: tokens.coral,
    borderRadius: 999,
    padding: "7px 12px",
    textDecoration: "none",
    whiteSpace: "nowrap",
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
    // The share text carries a newline before the site URL. This postcard is
    // the hand-copy fallback for browsers where navigator.clipboard is
    // unavailable, so what's shown has to match what gets copied — without
    // this, HTML collapses the break and the two diverge.
    whiteSpace: "pre-line",
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
  archiveCard: {
    display: "block",
    background: tokens.paperCard,
    border: `1px solid ${tokens.line}`,
    borderRadius: 8,
    padding: "14px 16px",
    marginTop: 20,
    textDecoration: "none",
    textAlign: "left",
  },
  archiveCardTitle: {
    display: "block",
    fontFamily: tokens.body,
    fontWeight: 600,
    fontSize: 15,
    color: tokens.coral,
    marginBottom: 4,
  },
  archiveCardBody: {
    display: "block",
    fontFamily: tokens.body,
    fontSize: 13,
    color: tokens.inkSoft,
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(43,36,32,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 9999,
  },
  modalCard: {
    background: tokens.paper,
    border: `1px solid ${tokens.line}`,
    borderRadius: 12,
    boxShadow: "0 18px 44px rgba(43,36,32,0.28)",
    width: "100%",
    maxWidth: 400,
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    outline: "none",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px 10px",
    borderBottom: `1px solid ${tokens.line}`,
  },
  modalTitle: {
    fontFamily: tokens.mono,
    fontSize: 12,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: tokens.ink,
  },
  modalClose: {
    fontFamily: tokens.body,
    fontSize: 16,
    lineHeight: 1,
    color: tokens.inkSoft,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 4,
  },
  modalBody: {
    padding: "16px",
    overflowY: "auto",
  },
  modalFooter: {
    fontFamily: tokens.mono,
    fontSize: 10,
    letterSpacing: "0.1em",
    color: tokens.inkSoft,
    padding: "8px 16px 12px",
    borderTop: `1px solid ${tokens.line}`,
  },
  statsEmpty: {
    fontFamily: tokens.body,
    fontSize: 14,
    color: tokens.inkSoft,
    textAlign: "center",
    padding: "12px 0",
  },
  statsRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 20,
  },
  statsFigure: {
    flex: 1,
    textAlign: "center",
  },
  statsValue: {
    fontFamily: tokens.mono,
    fontSize: 22,
    fontWeight: 700,
    color: tokens.ink,
  },
  statsLabel: {
    fontFamily: tokens.mono,
    fontSize: 9,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: tokens.inkSoft,
    marginTop: 2,
  },
  distTitle: {
    fontFamily: tokens.mono,
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: tokens.inkSoft,
    marginBottom: 8,
  },
  distRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  distIndex: {
    fontFamily: tokens.mono,
    fontSize: 12,
    color: tokens.ink,
    width: 10,
  },
  distBar: {
    height: 18,
    borderRadius: 3,
    display: "inline-block",
    minWidth: 6,
  },
  distCount: {
    fontFamily: tokens.mono,
    fontSize: 11,
    color: tokens.inkSoft,
  },
  howtoSection: {
    marginBottom: 12,
    lineHeight: 1.5,
  },
  howtoHeading: {
    fontFamily: tokens.body,
    fontWeight: 700,
    fontSize: 14,
    color: tokens.ink,
  },
  howtoBody: {
    fontFamily: tokens.body,
    fontSize: 14,
    color: tokens.inkSoft,
  },
  howtoLink: {
    fontFamily: tokens.mono,
    fontSize: 12,
    color: tokens.coral,
    textDecoration: "none",
  },
};
