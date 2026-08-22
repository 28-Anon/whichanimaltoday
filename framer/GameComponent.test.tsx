// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GameComponent from "./GameComponent";
import {
  animalFixture,
  pinClock,
  readHistory,
  releaseClock,
  renderWithData,
  resetEnvironment,
  seedHistory,
} from "./testHarness";

/**
 * The first automated coverage `framer/` has ever had.
 *
 * Scope is deliberately narrow: paths with a history of breaking, or written
 * so recently that nothing has confirmed them. Not coverage — this file is
 * roughly 2,200 lines and chasing a percentage would crowd out everything
 * else. See `docs/superpowers/specs/2026-08-07-framer-test-harness-design.md`.
 *
 * Every query goes through role and accessible name rather than markup, so the
 * tests track what a user can perceive. That has a useful side effect: a
 * control these tests cannot find by name is a control a screen reader cannot
 * find either.
 */

/** One eligible animal, so the day's index always resolves to it. */
const ONE_ANIMAL = [animalFixture()];

afterEach(() => {
  cleanup();
  releaseClock();
  resetEnvironment();
});

describe("loading today's puzzle", () => {
  it("shows the puzzle once the animal list arrives", async () => {
    pinClock("2026-08-07T12:00:00Z");
    renderWithData(<GameComponent />, ONE_ANIMAL);

    // Puzzle 7: 2026-08-07 is six days after the 2026-08-01 launch.
    expect(await screen.findByText(/FIELD FILE #7/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/what animal is this/i)).toBeTruthy();
  });

  it("lands on the reveal screen when today is already played", async () => {
    pinClock("2026-08-07T12:00:00Z");
    seedHistory([
      { date: "2026-08-07", puzzleNumber: 7, solved: true, guessesUsed: 1 },
    ]);
    renderWithData(<GameComponent />, ONE_ANIMAL);

    // The stamp only exists on the reveal card, so finding it proves the
    // restore path ran rather than the component starting a fresh puzzle.
    // Exact, case-sensitive: a loose /identified/i also matches the field
    // journal blurb further down the reveal card.
    expect(await screen.findByText("IDENTIFIED")).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/what animal is this/i)).toBeNull()
    );
  });
});

describe("the date a result is filed under", () => {
  // The bug this covers: the animal and puzzle number were chosen when the
  // page loaded, but the date was read again at completion. A session running
  // from 23:58 to 00:01 filed the day's puzzle under the next day, so the day
  // actually played was never recorded and the streak broke.
  it("uses the day the puzzle loaded, not the day the player finished", async () => {
    pinClock("2026-08-06T23:58:00Z");
    const { getByRole, getByPlaceholderText } = renderWithData(
      <GameComponent />,
      ONE_ANIMAL
    );

    await screen.findByText(/FIELD FILE #6/i);

    // Cross midnight while the puzzle is open.
    vi.setSystemTime(new Date("2026-08-07T00:01:00Z"));

    // fireEvent.change, not `input.value = …`: React tracks the previous value
    // on the DOM node and ignores an event whose value it thinks is unchanged,
    // so assigning directly leaves the component's state empty.
    const input = getByPlaceholderText(/what animal is this/i);
    fireEvent.change(input, { target: { value: "Otter" } });
    fireEvent.click(getByRole("button", { name: /guess/i }));

    await waitFor(() => expect(readHistory()).toHaveLength(1));
    const [entry] = readHistory();

    expect(entry.date).toBe("2026-08-06");
    expect(entry.puzzleNumber).toBe(6);
  });
});

describe("the date a result is filed under, without a bonus round", () => {
  // Deliberately separate from the test above. An animal with a bonus round
  // banks its win in `submitGuess` and never reaches `finishGame`, so a test
  // using the default fixture exercises only one of the two write paths — and
  // silently passed against the unfixed `finishGame`. A day with no bonus is
  // the only way to reach the other one.
  const NO_BONUS = [animalFixture({ bonus: undefined })];

  it("uses the load date on the direct win path", async () => {
    pinClock("2026-08-06T23:58:00Z");
    const { getByRole, getByPlaceholderText } = renderWithData(
      <GameComponent />,
      NO_BONUS
    );
    await screen.findByText(/FIELD FILE #6/i);

    vi.setSystemTime(new Date("2026-08-07T00:01:00Z"));
    fireEvent.change(getByPlaceholderText(/what animal is this/i), {
      target: { value: "Otter" },
    });
    fireEvent.click(getByRole("button", { name: /guess/i }));

    await waitFor(() => expect(readHistory()).toHaveLength(1));
    expect(readHistory()[0].date).toBe("2026-08-06");
    expect(readHistory()[0].puzzleNumber).toBe(6);
  });

  it("uses the load date on the losing path too", async () => {
    pinClock("2026-08-06T23:58:00Z");
    const { getByRole, getByPlaceholderText } = renderWithData(
      <GameComponent />,
      NO_BONUS
    );
    await screen.findByText(/FIELD FILE #6/i);

    vi.setSystemTime(new Date("2026-08-07T00:01:00Z"));
    for (const wrong of ["Badger", "Weasel", "Stoat"]) {
      fireEvent.change(getByPlaceholderText(/what animal is this/i), {
        target: { value: wrong },
      });
      fireEvent.click(getByRole("button", { name: /guess/i }));
    }

    await waitFor(() => expect(readHistory()).toHaveLength(1));
    expect(readHistory()[0].date).toBe("2026-08-06");
    expect(readHistory()[0].solved).toBe(false);
  });
});

describe("panel focus handling", () => {
  /** Everything Tab can reach inside the open dialog, in document order. */
  function focusablesInDialog(): HTMLElement[] {
    const dialog = screen.getByRole("dialog");
    return Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  async function openPanel(trigger: string) {
    pinClock("2026-08-07T12:00:00Z");
    const rendered = renderWithData(<GameComponent />, [animalFixture()]);
    await screen.findByText(/FIELD FILE #7/i);
    fireEvent.click(screen.getByRole("button", { name: trigger }));
    await screen.findByRole("dialog");
    return rendered;
  }

  const openStats = () => openPanel("Statistics");

  /**
   * Fails loudly if the panel has fewer than two focusable controls.
   *
   * Without this the wrapping tests are vacuous: the Statistics panel while a
   * puzzle is in progress holds only its Close button, so first and last are
   * the same element and both assertions pass whether the trap exists or not.
   * Disabling the trap entirely still left them green, which is how this was
   * caught.
   */
  function cycleableItems(): HTMLElement[] {
    const items = focusablesInDialog();
    expect(items.length).toBeGreaterThan(1);
    return items;
  }

  it("moves focus into the panel when it opens", async () => {
    await openStats();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  // Before the trap, Tab walked straight out of the panel and through the page
  // behind the backdrop — still there, still clickable, and invisible to
  // someone navigating by keyboard.
  it("wraps Tab from the last control back to the first", async () => {
    // How to Play, not Statistics: it holds a Close button and an archive
    // link, so the cycle has two ends to wrap between.
    await openPanel("How to play");
    const items = cycleableItems();
    items[items.length - 1].focus();

    fireEvent.keyDown(window, { key: "Tab" });

    expect(document.activeElement).toBe(items[0]);
  });

  it("wraps Shift+Tab from the first control to the last", async () => {
    await openPanel("How to play");
    const items = cycleableItems();
    items[0].focus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it("pulls focus back when it has escaped the panel", async () => {
    await openStats();
    const outside = screen.getByRole("button", { name: "How to play" });
    outside.focus();

    fireEvent.keyDown(window, { key: "Tab" });

    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  // React runs the outgoing panel's cleanup before the incoming panel's effect,
  // so the outgoing one focused its own trigger and the incoming one captured
  // *that* as the place to return to — leaving focus on the wrong button.
  it("returns focus to the button that opened the panel, after a switch", async () => {
    await openStats();
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "How to play" })
      )
    );
  });
});

describe("the bonus round", () => {
  async function solveIntoBonus() {
    pinClock("2026-08-07T12:00:00Z");
    const rendered = renderWithData(<GameComponent />, [animalFixture()]);
    await screen.findByText(/FIELD FILE #7/i);
    fireEvent.change(screen.getByPlaceholderText(/what animal is this/i), {
      target: { value: "Otter" },
    });
    fireEvent.click(screen.getByRole("button", { name: /guess/i }));
    return rendered;
  }

  it("opens the bonus round after a correct guess", async () => {
    await solveIntoBonus();
    expect(await screen.findByText(/One of these is true/i)).toBeTruthy();
  });

  // The win must be banked before the round opens. A player who closes the tab
  // mid-bonus has already earned the day and keeps their streak — the bonus is
  // additive and must never be able to cost it.
  it("banks the win before the bonus is answered", async () => {
    await solveIntoBonus();
    await waitFor(() => expect(readHistory()).toHaveLength(1));

    const [entry] = readHistory();
    expect(entry.solved).toBe(true);
    expect(entry.guessesUsed).toBe(1);
    expect(entry.bonus).toBeUndefined();
  });

  /**
   * `animals.json` is fetched at runtime from a file a content pipeline
   * writes, so the component cannot assume anyone validated it. The existing
   * guard checks that `options` is an array of four with an in-range
   * `answerIndex` — an array of four *objects* satisfies all of that, survives
   * shuffleBonusOptions (which only reorders), and then throws when React is
   * asked to render one as a button label. A throw inside the memo happens
   * during render, where the fetch's .catch() cannot reach it, and takes down
   * the whole day's puzzle rather than just the bonus round.
   */
  it.each([
    ["options that are not strings", { options: [{}, {}, {}, {}], answerIndex: 1 }],
    ["a question that is not a string", { question: { text: "hi" } }],
    ["no question at all", { question: "" }],
  ])("degrades to no bonus round on %s, keeping the puzzle alive", async (_label, bad) => {
    pinClock("2026-08-07T12:00:00Z");
    const animal = animalFixture();
    renderWithData(<GameComponent />, [
      animalFixture({ bonus: { ...(animal.bonus as object), ...bad } }),
    ]);
    await screen.findByText(/FIELD FILE #7/i);

    fireEvent.change(screen.getByPlaceholderText(/what animal is this/i), {
      target: { value: "Otter" },
    });
    fireEvent.click(screen.getByRole("button", { name: /guess/i }));

    // Straight to the reveal, exactly as for an animal with no bonus at all.
    expect(await screen.findByText("IDENTIFIED")).toBeTruthy();
    await waitFor(() => expect(readHistory()).toHaveLength(1));
    expect(readHistory()[0].solved).toBe(true);
  });

  it("records the bonus result and reaches the reveal screen", async () => {
    await solveIntoBonus();
    await screen.findByText(/One of these is true/i);

    fireEvent.click(screen.getByRole("button", { name: /I use tools/i }));
    // Picking is not committing. The answer is shown first — a player who
    // guessed wrong still learns the species — and a separate button ends the
    // round, which is the only place a bonus result reaches storage.
    fireEvent.click(await screen.findByRole("button", { name: /See the reveal/i }));

    await waitFor(() => expect(readHistory()[0].bonus).toBe("hit"));
    expect(await screen.findByText("IDENTIFIED")).toBeTruthy();
    // Still one entry: recordResult replaces by date rather than appending.
    expect(readHistory()).toHaveLength(1);
  });
});

describe("sound", () => {
  const PREFERENCES_KEY = "whichanimaltoday_preferences";

  interface FakeSound {
    /** The starting frequency of every note played, in order. */
    notes: number[];
    contexts: number;
    closed: number;
  }

  /**
   * A minimal Web Audio stand-in.
   *
   * jsdom implements none of it, which is itself the most important case
   * these tests cover — every test that does NOT install this one is
   * checking that the game is unaffected when audio simply does not exist.
   */
  function stubAudioContext(): { played: FakeSound; restore: () => void } {
    const played: FakeSound = { notes: [], contexts: 0, closed: 0 };
    const parameter = () => ({
      setValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
      value: 0,
    });

    class FakeAudioContext {
      state = "running";
      currentTime = 0;
      destination = {};
      constructor() {
        played.contexts += 1;
      }
      createGain() {
        return { gain: parameter(), connect: () => {}, disconnect: () => {} };
      }
      createOscillator() {
        return {
          type: "sine",
          frequency: {
            ...parameter(),
            setValueAtTime: (value: number) => void played.notes.push(value),
          },
          connect: () => {},
          start: () => {},
          stop: () => {},
          onended: null,
        };
      }
      resume() {
        return Promise.resolve();
      }
      close() {
        played.closed += 1;
        return Promise.resolve();
      }
    }

    const original = Object.getOwnPropertyDescriptor(window, "AudioContext");
    Object.defineProperty(window, "AudioContext", {
      value: FakeAudioContext,
      configurable: true,
      writable: true,
    });

    return {
      played,
      restore: () => {
        if (original) Object.defineProperty(window, "AudioContext", original);
        else delete (window as { AudioContext?: unknown }).AudioContext;
      },
    };
  }

  function storedPreferences(): Record<string, unknown> {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  }

  it("starts off, and says so in the control's name", async () => {
    // Off by default is the whole first-impression decision. A surprise noise
    // on a game played in bed and at work cannot be un-heard.
    pinClock("2026-08-07T12:00:00Z");
    renderWithData(<GameComponent />, ONE_ANIMAL);
    await screen.findByText(/FIELD FILE #7/i);

    const toggle = screen.getByRole("button", { name: /turn sound on/i });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(window.localStorage.getItem(PREFERENCES_KEY)).toBeNull();
  });

  it("writes the preference to its own key, not the game's", async () => {
    // A schema change to preferences must never be able to reach the history
    // that holds a player's streak.
    pinClock("2026-08-07T12:00:00Z");
    const audio = stubAudioContext();
    try {
      renderWithData(<GameComponent />, ONE_ANIMAL);
      await screen.findByText(/FIELD FILE #7/i);

      fireEvent.click(screen.getByRole("button", { name: /turn sound on/i }));

      await waitFor(() => expect(storedPreferences().soundEnabled).toBe(true));
      expect(readHistory()).toEqual([]);
      expect(
        screen.getByRole("button", { name: /turn sound off/i }).getAttribute("aria-pressed")
      ).toBe("true");

      fireEvent.click(screen.getByRole("button", { name: /turn sound off/i }));
      await waitFor(() => expect(storedPreferences().soundEnabled).toBe(false));
    } finally {
      audio.restore();
    }
  });

  it("honours a preference set in an earlier session", async () => {
    pinClock("2026-08-07T12:00:00Z");
    window.localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ soundEnabled: true })
    );
    renderWithData(<GameComponent />, ONE_ANIMAL);

    expect(
      await screen.findByRole("button", { name: /turn sound off/i })
    ).toBeTruthy();
  });

  it("stays silent until the player turns it on", async () => {
    pinClock("2026-08-07T12:00:00Z");
    const audio = stubAudioContext();
    try {
      renderWithData(<GameComponent />, ONE_ANIMAL);
      await screen.findByText(/FIELD FILE #7/i);

      fireEvent.change(screen.getByPlaceholderText(/what animal is this/i), {
        target: { value: "Otter" },
      });
      fireEvent.click(screen.getByRole("button", { name: /guess/i }));
      await screen.findByText(/One of these is true/i);

      // Not even a context: audio is never started for a player who did not
      // ask for it, which is also what keeps autoplay policy out of the way.
      expect(audio.played.contexts).toBe(0);
      expect(audio.played.notes).toEqual([]);
    } finally {
      audio.restore();
    }
  });

  it("plays the win and the bonus miss once sound is on", async () => {
    pinClock("2026-08-07T12:00:00Z");
    const audio = stubAudioContext();
    try {
      renderWithData(<GameComponent />, ONE_ANIMAL);
      await screen.findByText(/FIELD FILE #7/i);

      // The toggle is the user gesture that unlocks audio, and its own
      // confirmation sound is the first thing played.
      fireEvent.click(screen.getByRole("button", { name: /turn sound on/i }));
      await waitFor(() => expect(audio.played.notes.length).toBeGreaterThan(0));
      audio.played.notes.length = 0;

      fireEvent.change(screen.getByPlaceholderText(/what animal is this/i), {
        target: { value: "Otter" },
      });
      fireEvent.click(screen.getByRole("button", { name: /guess/i }));
      // Two rising notes, C5 then G5.
      expect(audio.played.notes).toEqual([523.25, 783.99]);

      await screen.findByText(/One of these is true/i);
      audio.played.notes.length = 0;
      fireEvent.click(screen.getByRole("button", { name: /I have no fur/i }));
      // Two falling notes, G4 then D4 — disappointment, not punishment.
      expect(audio.played.notes).toEqual([392.0, 293.66]);

      // One context for the whole session, however many sounds it plays.
      expect(audio.played.contexts).toBe(1);
    } finally {
      audio.restore();
    }
  });

  it("plays the soft wrong-guess note on a miss", async () => {
    pinClock("2026-08-07T12:00:00Z");
    const audio = stubAudioContext();
    try {
      renderWithData(<GameComponent />, ONE_ANIMAL);
      await screen.findByText(/FIELD FILE #7/i);
      fireEvent.click(screen.getByRole("button", { name: /turn sound on/i }));
      audio.played.notes.length = 0;

      fireEvent.change(screen.getByPlaceholderText(/what animal is this/i), {
        target: { value: "Badger" },
      });
      fireEvent.click(screen.getByRole("button", { name: /guess/i }));

      expect(audio.played.notes).toEqual([220]);
    } finally {
      audio.restore();
    }
  });

  it("finishes the puzzle when the browser has no audio at all", async () => {
    // jsdom provides no AudioContext, so this is the real degradation path:
    // sound must never be able to break a puzzle.
    pinClock("2026-08-07T12:00:00Z");
    renderWithData(<GameComponent />, [animalFixture({ bonus: undefined })]);
    await screen.findByText(/FIELD FILE #7/i);

    fireEvent.click(screen.getByRole("button", { name: /turn sound on/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /turn sound off/i })).toBeTruthy()
    );

    fireEvent.change(screen.getByPlaceholderText(/what animal is this/i), {
      target: { value: "Otter" },
    });
    fireEvent.click(screen.getByRole("button", { name: /guess/i }));

    expect(await screen.findByText("IDENTIFIED")).toBeTruthy();
    await waitFor(() => expect(readHistory()[0].solved).toBe(true));
  });

  it("finishes the puzzle when creating the context throws", async () => {
    // Some browsers throw on construction rather than omitting the API —
    // an iframe without the autoplay permission, for one.
    pinClock("2026-08-07T12:00:00Z");
    const original = Object.getOwnPropertyDescriptor(window, "AudioContext");
    Object.defineProperty(window, "AudioContext", {
      value: function Hostile() {
        throw new Error("blocked");
      },
      configurable: true,
      writable: true,
    });

    try {
      renderWithData(<GameComponent />, [animalFixture({ bonus: undefined })]);
      await screen.findByText(/FIELD FILE #7/i);
      fireEvent.click(screen.getByRole("button", { name: /turn sound on/i }));

      fireEvent.change(screen.getByPlaceholderText(/what animal is this/i), {
        target: { value: "Otter" },
      });
      fireEvent.click(screen.getByRole("button", { name: /guess/i }));

      expect(await screen.findByText("IDENTIFIED")).toBeTruthy();
      // The preference still took, even though nothing can play it.
      expect(storedPreferences().soundEnabled).toBe(true);
    } finally {
      if (original) Object.defineProperty(window, "AudioContext", original);
      else delete (window as { AudioContext?: unknown }).AudioContext;
    }
  });
});
