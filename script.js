
/*
  Japanese Flashcards
  Supabase connection, vocabulary, authentication, and daily streaks.
*/

const SUPABASE_URL = "https://ckbasqdqtmxwrixcctca.supabase.co";
const SUPABASE_KEY = "sb_publishable_Gumosi4t5hmBCR_eiLLNNw_unIoQjo_";
const OWNER_EMAIL = "loidtourne@gmail.com";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

const BLIP_TOTAL = 5;
const MILESTONES = [3, 7, 14, 30, 60, 100, 365];

let cards = [];
let currentCardIndex = 0;
let currentUser = null;
let isOwner = false;
let busy = false;

let dailyHistory = [];
let todaysBlips = [];
let dailyCompleted = false;
let dailySaveInProgress = false;
let historyLoaded = false;
let lastBlipDate = getTodayKey();

const flashcard = $("flashcard");
const blipDots = [...document.querySelectorAll("[data-blip]")];

// --------------------------------------------------
// General helpers
// --------------------------------------------------

function setMessage(id, message, isError = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.style.color = isError ? "#ff9b9b" : "";
}

function getTodayKey() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDateOffset(dateString, offset) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  date.setDate(date.getDate() + offset);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function setAppStatus(message) {
  setMessage("appStatus", message);
}

// --------------------------------------------------
// Authentication and interface
// --------------------------------------------------

function updateInterface() {
  $("authSection").hidden = Boolean(currentUser);
  $("studySection").hidden = !currentUser;

  if (!currentUser) {
    setAppStatus("Please sign in to continue.");
    return;
  }

  setAppStatus(`Signed in as ${currentUser.email ?? "your account"}.`);
}

async function syncSession(session) {
  currentUser = session?.user ?? null;

  isOwner = Boolean(
    currentUser?.email &&
    currentUser.email.toLowerCase() === OWNER_EMAIL.toLowerCase()
  );

  if (currentUser && !isOwner) {
    await db.auth.signOut();
    currentUser = null;
    isOwner = false;

    updateInterface();
    setAppStatus("This account is not authorized to access the study app.");
    return;
  }

  updateInterface();

  if (!currentUser) {
    cards = [];
    dailyHistory = [];
    todaysBlips = [];
    dailyCompleted = false;
    historyLoaded = false;

    renderCard(null);
    clearBlipsDisplay();
    renderDailyHistory();
    renderStreaks([]);

    setMessage("blipStatus", "Sign in to save your daily study history.");
    return;
  }

  await Promise.all([
    loadCards(),
    loadDailyHistory()
  ]);
}

$("signInForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (busy) return;

  busy = true;

  const submitButton = $("signInForm").querySelector(
    'button[type="submit"]'
  );

  if (submitButton) submitButton.disabled = true;

  setAppStatus("Signing in…");

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email: $("email").value.trim(),
      password: $("password").value
    });

    if (error) throw error;

    if (
      data.user?.email?.toLowerCase() !== OWNER_EMAIL.toLowerCase()
    ) {
      await db.auth.signOut();
      throw new Error("This account is not authorized to access the study app.");
    }

    $("password").value = "";

    await syncSession(data.session);
  } catch (error) {
    console.error("Sign-in failed:", error);
    setAppStatus(error.message || "Sign-in failed.");
  } finally {
    busy = false;
    if (submitButton) submitButton.disabled = false;
  }
});

$("signOutButton").addEventListener("click", async () => {
  if (busy) return;

  busy = true;
  setAppStatus("Signing out…");

  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;

    currentUser = null;
    isOwner = false;

    await syncSession(null);
    setAppStatus("Signed out successfully.");
  } catch (error) {
    console.error("Sign-out failed:", error);
    setAppStatus(error.message || "Sign-out failed.");
  } finally {
    busy = false;
  }
});

// --------------------------------------------------
// Flashcards
// --------------------------------------------------

async function loadCards() {
  $("cardCounter").textContent = "Loading cards…";

  try {
    const { data, error } = await db
      .from("flashcards")
      .select("id, kanji, hiragana, romaji, class, english, definition, created_at")
      .order("created_at", { ascending: true });

    if (error) throw error;

    cards = data ?? [];
    currentCardIndex = 0;

    if (cards.length) {
      renderCard(cards[currentCardIndex]);
    } else {
      renderCard(null);
    }
  } catch (error) {
    console.error("Could not load flashcards:", error);
    $("cardCounter").textContent = "Couldn't load flashcards.";
  }
}

function renderCard(card) {
  if (!card) {
    flashcard.classList.remove("flipped");
    flashcard.setAttribute("aria-pressed", "false");

    $("cardKanji").textContent = "日本語";
    $("cardHiragana").textContent = "—";
    $("cardRomaji").textContent = "—";
    $("cardClass").textContent = "—";
    $("cardEnglish").textContent = "—";
    $("cardDefinition").textContent = "No cards available";
    $("cardCounter").textContent = "0 cards";

    return;
  }

  $("cardKanji").textContent = card.kanji ?? "";
  $("cardHiragana").textContent = card.hiragana ?? "";
  $("cardRomaji").textContent = card.romaji ?? "";
  $("cardClass").textContent = card.class ?? "";
  $("cardEnglish").textContent = card.english || "—";
  $("cardDefinition").textContent = card.definition ?? "";

  $("cardCounter").textContent =
    `Card ${currentCardIndex + 1} of ${cards.length}`;

  flashcard.classList.remove("flipped");
  flashcard.setAttribute("aria-pressed", "false");
}

function chooseRandomCard() {
  if (!cards.length) {
    renderCard(null);
    return;
  }

  let candidates = cards;

  if (cards.length > 1) {
    const currentCard = cards[currentCardIndex];

    candidates = cards.filter((card) => card.id !== currentCard?.id);
  }

  const nextCard = candidates[
    Math.floor(Math.random() * candidates.length)
  ];

  currentCardIndex = cards.findIndex((card) => card.id === nextCard.id);
  renderCard(nextCard);
}

flashcard.addEventListener("click", () => {
  if (!cards.length) return;

  flashcard.classList.toggle("flipped");
  flashcard.setAttribute(
    "aria-pressed",
    String(flashcard.classList.contains("flipped"))
  );
});

$("flipCardButton").addEventListener("click", () => {
  if (!cards.length) return;

  flashcard.classList.toggle("flipped");
  flashcard.setAttribute(
    "aria-pressed",
    String(flashcard.classList.contains("flipped"))
  );
});

$("nextCardButton").addEventListener("click", chooseRandomCard);

// --------------------------------------------------
// Daily blips
// --------------------------------------------------

function getDisplayedBlipColors() {
  return blipDots.map((dot) => {
    if (dot.classList.contains("green")) return "green";
    if (dot.classList.contains("red")) return "red";
    return null;
  });
}

function areAllBlipsFilled() {
  const colors = getDisplayedBlipColors();

  return colors.length === BLIP_TOTAL &&
    colors.every((color) => color === "green" || color === "red");
}

function clearBlipsDisplay() {
  blipDots.forEach((dot) => {
    dot.classList.remove("green", "red");
  });

  todaysBlips = [];
  updateBlipLabel();
  updateDailyControls();
  renderBlipCount();
}

function renderBlipCount() {
  const completed = todaysBlips.length;
  const greenCount = todaysBlips.filter((color) => color === "green").length;

  $("blipCount").textContent =
    `${completed} of ${BLIP_TOTAL} completed (${greenCount} green)`;
}

function updateBlipLabel() {
  $("blipDots").setAttribute(
    "aria-label",
    `Progress: ${todaysBlips.length} of ${BLIP_TOTAL}`
  );
}

function updateDailyControls() {
  const locked =
    !currentUser ||
    !historyLoaded ||
    dailyCompleted ||
    dailySaveInProgress ||
    todaysBlips.length >= BLIP_TOTAL;

  $("greenBlipButton").disabled = locked;
  $("redBlipButton").disabled = locked;

  $("resetBlipsButton").disabled =
    !currentUser || dailySaveInProgress || dailyCompleted;
}

function renderBlips() {
  blipDots.forEach((dot, index) => {
    dot.classList.remove("green", "red");

    const color = todaysBlips[index];

    if (color) dot.classList.add(color);
  });

  renderBlipCount();
  updateBlipLabel();
  updateDailyControls();
}

function setBlip(color) {
  if (!currentUser || !historyLoaded) return;
  if (dailyCompleted || dailySaveInProgress) return;
  if (todaysBlips.length >= BLIP_TOTAL) return;
  if (color !== "green" && color !== "red") return;

  // A new local date always starts with a fresh set of blips.
  if (getTodayKey() !== lastBlipDate) {
    handleNewDay();
    return;
  }

  todaysBlips.push(color);
  renderBlips();

  if (areAllBlipsFilled()) {
    const greenCount = todaysBlips.filter(
      (value) => value === "green"
    ).length;

    if (greenCount >= 3) launchConfetti();

    saveDailyResultIfComplete();
  } else {
    setMessage(
      "blipStatus",
      `Today's progress: ${todaysBlips.length} of ${BLIP_TOTAL} blips completed.`
    );
  }
}

$("greenBlipButton").addEventListener("click", () => setBlip("green"));
$("redBlipButton").addEventListener("click", () => setBlip("red"));

$("resetBlipsButton").addEventListener("click", () => {
  if (!currentUser || dailyCompleted || dailySaveInProgress) return;

  clearBlipsDisplay();
  setMessage("blipStatus", "Today's unfinished progress was cleared.");
});

// --------------------------------------------------
// Daily history and duplicate protection
// --------------------------------------------------

async function loadDailyHistory() {
  if (!currentUser) return;

  historyLoaded = false;
  updateDailyControls();
  setMessage("blipStatus", "Loading daily history…");

  try {
    const { data, error } = await db
      .from("daily_blip_history")
      .select("study_date, green_count, total_blips, qualifies, completed_at")
      .eq("user_id", currentUser.id)
      .order("study_date", { ascending: false });

    if (error) throw error;

    dailyHistory = data ?? [];

    // Defensive check: the database constraint should already prevent this.
    const seenDates = new Set();

    for (const row of dailyHistory) {
      if (seenDates.has(row.study_date)) {
        console.error("Duplicate date found in daily history:", row.study_date);
      }
      seenDates.add(row.study_date);
    }

    const todayRecord = dailyHistory.find(
      (row) => row.study_date === getTodayKey()
    );

    if (todayRecord) {
      dailyCompleted = true;

      // The database stores the count, not the order of the original colors.
      // Reconstruct a representative display without changing the record.
      const greenCount = Math.min(
        Number(todayRecord.green_count) || 0,
        BLIP_TOTAL
      );

      todaysBlips = Array.from(
        { length: BLIP_TOTAL },
        (_, index) => index < greenCount ? "green" : "red"
      );

      setMessage(
        "blipStatus",
        `✓ Today's result is saved — ${greenCount}/${todayRecord.total_blips ?? BLIP_TOTAL} green.`
      );
    } else {
      dailyCompleted = false;
      todaysBlips = [];

      setMessage(
        "blipStatus",
        "Complete five blips to save today's result."
      );
    }

    historyLoaded = true;

    renderBlips();
    renderDailyHistory();
    renderStreaks(dailyHistory);
  } catch (error) {
    console.error("Could not load daily history:", error);

    setMessage(
      "blipStatus",
      `Couldn't load daily history: ${error.message}`,
      true
    );
  } finally {
    updateDailyControls();
  }
}

async function saveDailyResultIfComplete() {
  if (!currentUser || !historyLoaded) return;
  if (dailyCompleted || dailySaveInProgress) return;
  if (!areAllBlipsFilled()) return;

  const today = getTodayKey();

  // Do not attempt another write if today's record is already loaded.
  if (dailyHistory.some((row) => row.study_date === today)) {
    dailyCompleted = true;
    setMessage("blipStatus", "Today's result is already saved.");
    updateDailyControls();
    return;
  }

  const colors = getDisplayedBlipColors();
  const greenCount = colors.filter((color) => color === "green").length;

  dailySaveInProgress = true;
  updateDailyControls();
  setMessage("blipStatus", "Saving today's result…");

  try {
    const { error } = await db
      .from("daily_blip_history")
      .upsert(
        {
          user_id: currentUser.id,
          study_date: today,
          green_count: greenCount,
          total_blips: BLIP_TOTAL,
          qualifies: greenCount === BLIP_TOTAL,
          completed_at: new Date().toISOString()
        },
        {
          onConflict: "user_id,study_date",
          ignoreDuplicates: true
        }
      );

    if (error) throw error;

    // Read the authoritative row. This also handles an ignored duplicate.
    dailySaveInProgress = false;
    await loadDailyHistory();

    setMessage(
      "blipStatus",
      "Today's result has been saved or was already recorded."
    );
  } catch (error) {
    console.error("Could not save daily result:", error);

    setMessage(
      "blipStatus",
      "Couldn't save today's result. Your blips are still on screen; retry after checking your connection.",
      true
    );
  } finally {
    dailySaveInProgress = false;
    updateDailyControls();
  }
}

// --------------------------------------------------
// History display
// --------------------------------------------------

function renderDailyHistory() {
  const container = $("dailyHistory");
  container.replaceChildren();

  if (!dailyHistory.length) {
    const empty = document.createElement("p");
    empty.textContent = "No daily history yet.";
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "daily-history";

  dailyHistory.forEach((row) => {
    const item = document.createElement("li");

    const date = document.createElement("span");
    date.className = "history-date";
    date.textContent = row.study_date;

    const score = document.createElement("span");
    score.className = "history-score";
    score.classList.add(
      row.qualifies ? "history-qualified" : "history-failed"
    );

    score.textContent =
      `${row.green_count ?? 0}/${row.total_blips ?? BLIP_TOTAL} green`;

    item.append(date, score);
    list.appendChild(item);
  });

  container.appendChild(list);
}

// --------------------------------------------------
// Current combo, highest combo, and milestones
// --------------------------------------------------

function calculateStreaks(history) {
  const byDate = new Map(
    history.map((day) => [day.study_date, day])
  );

  const today = getTodayKey();
  const todayRecord = byDate.get(today);

  let currentStreak = 0;
  let cursor = today;

  // If today has no result, carry yesterday's streak until today is completed.
  if (!todayRecord) {
    cursor = getDateOffset(today, -1);
  } else if (!todayRecord.qualifies) {
    cursor = null;
  }

  while (cursor && byDate.get(cursor)?.qualifies) {
    currentStreak++;
    cursor = getDateOffset(cursor, -1);
  }

  const sorted = [...history].sort((a, b) =>
    a.study_date.localeCompare(b.study_date)
  );

  let running = 0;
  let bestStreak = 0;
  let previousDate = null;

  for (const day of sorted) {
    if (!day.qualifies) {
      running = 0;
      previousDate = day.study_date;
      continue;
    }

    if (
      previousDate &&
      getDateOffset(previousDate, 1) === day.study_date
    ) {
      running++;
    } else {
      running = 1;
    }

    bestStreak = Math.max(bestStreak, running);
    previousDate = day.study_date;
  }

  return { currentStreak, bestStreak };
}

function renderStreaks(history) {
  const { currentStreak, bestStreak } = calculateStreaks(history);

  const currentElement = $("currentStreak");
  currentElement.textContent =
    `🔥 ${currentStreak} day${currentStreak === 1 ? "" : "s"}`;

  currentElement.classList.toggle("active-combo", currentStreak > 0);

  $("highestStreak").textContent =
    `${bestStreak} day${bestStreak === 1 ? "" : "s"}`;

  renderMilestones(bestStreak);
}

function renderMilestones(bestStreak) {
  const section = $("streakSection");
  let container = section.querySelector(".streak-milestones");

  if (!container) {
    container = document.createElement("div");
    container.className = "streak-milestones";
    container.setAttribute("aria-label", "Streak milestones");
    section.appendChild(container);
  }

  container.replaceChildren();

  MILESTONES.forEach((target) => {
    const badge = document.createElement("span");
    badge.textContent = `${target}-day streak`;

    if (bestStreak >= target) {
      badge.classList.add("unlocked");
    }

    container.appendChild(badge);
  });
}

// --------------------------------------------------
// Confetti
// --------------------------------------------------

function launchConfetti() {
  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  const colors = [
    "#ff6b6b",
    "#ffd166",
    "#06d6a0",
    "#4dabf7",
    "#c77dff",
    "#ff8fab"
  ];

  for (let index = 0; index < 60; index++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.backgroundColor = colors[index % colors.length];

    piece.style.setProperty(
      "--drift",
      `${Math.random() * 240 - 120}px`
    );

    piece.style.setProperty(
      "--rotation",
      `${Math.random() * 1440 - 720}deg`
    );

    document.body.appendChild(piece);

    piece.addEventListener(
      "animationend",
      () => piece.remove(),
      { once: true }
    );
  }
}

// --------------------------------------------------
// Midnight rollover
// --------------------------------------------------

async function handleNewDay() {
  lastBlipDate = getTodayKey();

  // Reset only the in-progress display; never delete saved history.
  dailyCompleted = false;
  dailySaveInProgress = false;
  todaysBlips = [];

  clearBlipsDisplay();

  if (currentUser) {
    await loadDailyHistory();
  } else {
    setMessage(
      "blipStatus",
      "A new day has started. Sign in to save your daily study result."
    );
  }
}

// Check periodically so unfinished blips clear shortly after local midnight.
setInterval(() => {
  if (getTodayKey() !== lastBlipDate) {
    handleNewDay();
  }
}, 15000);

// --------------------------------------------------
// Start the application
// --------------------------------------------------

async function startApp() {
  setAppStatus("Checking your session…");

  try {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;

    await syncSession(data.session);
  } catch (error) {
    console.error("App initialization failed:", error);
    setAppStatus(`Unable to initialize the app: ${error.message}`);
  }

  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      setTimeout(() => syncSession(null), 0);
    }
  });
}

startApp();
