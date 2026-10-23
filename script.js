
/*
  Japanese Flashcards
  Configure these values using your Supabase project.
*/
const SUPABASE_URL = "https://ckbasqdqtmxwrixcctca.supabase.co";
const SUPABASE_KEY = "sb_publishable_Gumosi4t5hmBCR_eiLLNNw_unIoQjo_";
const OWNER_EMAIL = "loidtourne@gmail.com";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = (id) => document.getElementById(id);

let cards = [];
let currentCard = null;
let currentUser = null;
let isOwner = false;
let busy = false;

const flashcard = $("flashcard");
const resetBlipsButton = document.getElementById("resetBlipsButton");

function setMessage(id, message, isError = false) {
  const el = $(id);
  el.textContent = message;
  el.style.color = isError ? "#ff9b9b" : "";
}

function updateInterface() {
  $("authButton").textContent = currentUser ? "Sign out" : "Sign in";
  $("accountStatus").textContent = currentUser
    ? (isOwner ? "Signed in as owner" : "Signed in")
    : "Study mode";

  $("addButton").hidden = !isOwner;
  if (!isOwner) $("addPanel").hidden = true;

  $("cardCount").textContent =
    `${cards.length} card${cards.length === 1 ? "" : "s"}`;
}

function renderCard(card) {
  const wasFlipped = flashcard.classList.contains("flipped");

  currentCard = card;

  if (!card) {
    flashcard.classList.remove("flipped");
    flashcard.setAttribute("aria-pressed", "false");

    $("kanji").textContent = "日本語";
    $("hiragana").textContent = "—";
    $("romaji").textContent = "—";
    $("class").textContent = "—";
    $("english").textContent = "—";
    $("definition").textContent = "No cards available";
    return;
  }

  $("kanji").textContent = card.kanji;
  $("hiragana").textContent = card.hiragana;
  $("romaji").textContent = card.romaji;
  $("class").textContent = card.class;
  $("english").textContent = card.english || "—";
  $("definition").textContent = card.definition;

  // Preserve the card's current side.
  flashcard.classList.toggle("flipped", wasFlipped);
  flashcard.setAttribute("aria-pressed", String(wasFlipped));
}

function chooseRandomCard() {
  if (cards.length === 0) {
    renderCard(null);
    setMessage(
      "status",
      "No cards available. Add your first card when signed in."
    );
    return;
  }

  let candidates = cards;

  if (currentCard && cards.length > 1) {
    candidates = cards.filter(card => card.id !== currentCard.id);
  }

  const next = candidates[Math.floor(Math.random() * candidates.length)];
  renderCard(next);
  setMessage("status", "Ready to study.");
}

async function loadCards() {
  setMessage("status", "Loading vocabulary…");
  $("randomButton").disabled = true;

  try {
    const { data, error } = await db
      .from("flashcards")
      .select(
        "id, kanji, hiragana, romaji, class, english, definition, created_at"
      )
      .order("created_at", { ascending: true });

    if (error) throw error;

    cards = data || [];
    updateInterface();

    if (cards.length > 0) {
      chooseRandomCard();
    } else {
      renderCard(null);
      setMessage(
        "status",
        "Your vocabulary is empty. Sign in to add your first card."
      );
    }
  } catch (error) {
    console.error("Could not load flashcards:", error);
    setMessage(
      "status",
      "Couldn't load cards. Check your connection and Supabase settings.",
      true
    );
  } finally {
    $("randomButton").disabled = false;
  }
}

/*
  Current Combo card styling:
  The entire card is active only when today's saved result qualifies.
*/
function setCurrentComboActive(isActive) {
  document
    .querySelector(".current-combo-card")
    ?.classList.toggle("active-combo", Boolean(isActive));
}

async function loadDailyHistory() {
  if (!currentUser) {
    const currentStreakElement = $("currentStreak");

    currentStreakElement.textContent = "🔥 0 days";
    currentStreakElement.classList.remove("active-combo");

    setCurrentComboActive(false);

    $("bestStreak").textContent = "0 days";
    renderMilestones(0);
    return;
  }

  const { data, error } = await db
    .from("daily_blip_history")
    .select("study_date, green_count, total_blips, qualifies")
    .eq("user_id", currentUser.id)
    .order("study_date", { ascending: false });

  if (error) {
    console.error("Could not load daily history:", error);
    return;
  }

  const history = data || [];

  // The card's orange gradient depends on today's saved result,
  // not on a streak that may have carried over from yesterday.
  const todayRecord = history.find(
    day => day.study_date === getTodayKey()
  );

  const todayQualifies = Boolean(
    todayRecord &&
    Number(todayRecord.total_blips ?? 5) === 5 &&
    (
      todayRecord.qualifies ??
      (Number(todayRecord.green_count) >= 3)
    )
  );

  setCurrentComboActive(todayQualifies);

  const { currentStreak, bestStreak } =
    calculateStreaks(history);

  const currentStreakElement = $("currentStreak");

  currentStreakElement.textContent =
    `🔥 ${currentStreak} day${currentStreak === 1 ? "" : "s"}`;

  currentStreakElement.classList.toggle(
    "active-combo",
    currentStreak > 0
  );

  $("bestStreak").textContent =
    `${bestStreak} day${bestStreak === 1 ? "" : "s"}`;

  renderMilestones(bestStreak);
}

async function syncSession(session) {
  currentUser = session?.user || null;

  isOwner = Boolean(
    currentUser?.email &&
    currentUser.email.toLowerCase() === OWNER_EMAIL.toLowerCase()
  );

  $("loginPanel").hidden = true;
  updateInterface();

  await loadDailyHistory();

  if (currentUser) {
    // Supabase determines whether today's session has already been saved.
    // Preserve a complete in-memory session if the user signs in afterward.
    await loadTodaysResult({
      preserveUnsubmittedProgress: true
    });
    
  } else {
    dailyCompleted = false;
    clearBlipsDisplay();
    setCurrentComboActive(false);

    setDailyStatus("");

    updateDailyControls();
  }
}

// Flashcard interactions
flashcard.addEventListener("click", () => {
  if (!currentCard) return;

  flashcard.classList.toggle("flipped");

  flashcard.setAttribute(
    "aria-pressed",
    String(flashcard.classList.contains("flipped"))
  );
});

$("randomButton").addEventListener("click", chooseRandomCard);

// Sign in / sign out
$("authButton").addEventListener("click", async () => {
  if (busy) return;

  if (currentUser) {
    busy = true;

    try {
      const { error } = await db.auth.signOut();
      if (error) throw error;

      setMessage("status", "Signed out.");
    } catch (error) {
      setMessage(
        "status",
        error.message || "Sign out failed.",
        true
      );
    } finally {
      busy = false;
    }
  } else {
    $("loginPanel").hidden = !$("loginPanel").hidden;
    $("loginMessage").textContent = "";
  }
});

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (busy) return;

  busy = true;

  const submit = $("loginForm").querySelector(
    'button[type="submit"]'
  );

  submit.disabled = true;
  setMessage("loginMessage", "Signing in…");

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email: $("email").value.trim(),
      password: $("password").value
    });

    if (error) throw error;

    if (
      data.user?.email?.toLowerCase() !==
      OWNER_EMAIL.toLowerCase()
    ) {
      await db.auth.signOut();

      throw new Error(
        "This account is not authorized to manage vocabulary."
      );
    }

    $("password").value = "";
    $("loginPanel").hidden = true;

    setMessage("status", "Signed in successfully.");
  } catch (error) {
    setMessage(
      "loginMessage",
      error.message || "Sign-in failed.",
      true
    );
  } finally {
    busy = false;
    submit.disabled = false;
  }
});

// Add vocabulary card
$("addButton").addEventListener("click", () => {
  if (!isOwner) return;

  $("addPanel").hidden = !$("addPanel").hidden;

  if (!$("addPanel").hidden) {
    $("newKanji").focus();
  }
});

$("cancelAdd").addEventListener("click", () => {
  $("addPanel").hidden = true;
  $("addForm").reset();
  setMessage("saveMessage", "");
});

$("addForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isOwner || !currentUser || busy) {
    setMessage(
      "saveMessage",
      "Please sign in with your authorized account.",
      true
    );
    return;
  }

  const newCard = {
    kanji: $("newKanji").value.trim(),
    hiragana: $("newHiragana").value.trim(),
    romaji: $("newRomaji").value.trim(),
    class: $("newClass").value.trim(),
    english: $("newEnglish").value.trim(),
    definition: $("newDefinition").value.trim()
  };

  if (Object.values(newCard).some(value => !value)) {
    setMessage(
      "saveMessage",
      "Please complete all six fields.",
      true
    );
    return;
  }

  busy = true;

  const saveButton = $("addForm").querySelector(
    'button[type="submit"]'
  );

  saveButton.disabled = true;
  setMessage("saveMessage", "Saving card…");

  try {
    const { data, error } = await db
      .from("flashcards")
      .insert(newCard)
      .select(
        "id, kanji, hiragana, romaji, class, english, definition, created_at"
      )
      .single();

    if (error) throw error;

    // Add the confirmed database result to the live list.
    cards.push(data);
    updateInterface();
    renderCard(data);

    $("addForm").reset();
    $("addPanel").hidden = true;

    setMessage(
      "status",
      `Saved "${data.kanji}". Your new card is ready!`
    );

    setMessage("saveMessage", "");
  } catch (error) {
    console.error("Could not save flashcard:", error);

    setMessage(
      "saveMessage",
      "Couldn't save the card. Check your sign-in and database permissions.",
      true
    );
  } finally {
    busy = false;
    saveButton.disabled = false;
  }
});

// Daily blip tracker
const blips = document.querySelectorAll(".blip");
const blipContainer = document.getElementById("blips");
const correctButton = document.getElementById("correctButton");
const incorrectButton = document.getElementById("incorrectButton");

let blipIndex = 0;
let dailyCompleted = false;
let dailySaveInProgress = false;
let todayStatusElement = null;
let lastBlipDate = getTodayKey();

// Get today's local date, such as 2026-10-20.
function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function ensureDailyStatusElement() {
  return null;
}

function setDailyStatus(message, isError = false) {
  // Status messages are intentionally disabled.
}

function getDisplayedBlipColors() {
  return Array.from(blips).map(blip => {
    if (blip.classList.contains("green")) return "green";
    if (blip.classList.contains("red")) return "red";

    return null;
  });
}

function areAllBlipsFilled() {
  const colors = getDisplayedBlipColors();

  return colors.length === 5 &&
    colors.every(
      color => color === "green" || color === "red"
    );
}

function clearBlipsDisplay() {
  blips.forEach(blip => {
    blip.classList.remove("green", "red");
  });

  blipIndex = 0;

  updateBlipLabel();
  updateDailyControls();
}

function updateDailyControls() {
  const locked =
    dailyCompleted ||
    dailySaveInProgress ||
    blipIndex >= blips.length;

  correctButton.disabled = locked;
  incorrectButton.disabled = locked;

  if (resetBlipsButton) {
    resetBlipsButton.disabled =
      dailyCompleted || dailySaveInProgress;
  }
}

async function loadTodaysResult({
  preserveUnsubmittedProgress = false
} = {}) {
  if (!currentUser) {
    dailyCompleted = false;

    clearBlipsDisplay();

    setDailyStatus(
      "Sign in to save your daily study result across devices."
    );

    return null;
  }

  const currentColors = getDisplayedBlipColors();

  const hasCompleteUnsubmittedProgress =
    preserveUnsubmittedProgress &&
    currentColors.length === 5 &&
    currentColors.every(
      color => color === "green" || color === "red"
    );

  const { data, error } = await db
    .from("daily_blip_history")
    .select("study_date, green_count, total_blips, qualifies")
    .eq("user_id", currentUser.id)
    .eq("study_date", getTodayKey())
    .maybeSingle();

  if (error) {
    console.error("Could not load today's result:", error);

    setDailyStatus(
      "Couldn't load today's study result. Please refresh to try again.",
      true
    );

    return null;
  }

  if (data) {
    dailyCompleted = true;

    blips.forEach(blip => {
      blip.classList.remove("green", "red");
    });

    blipIndex = 5;

    updateBlipLabel();

    const total = Number(data.total_blips || 5);
    const greenCount = Number(data.green_count || 0);

    setDailyStatus(
      `✓ Completed today — ${greenCount}/${total} correct.`
    );

    updateDailyControls();

    return data;
  }

  dailyCompleted = false;

  if (!hasCompleteUnsubmittedProgress) {
    clearBlipsDisplay();
  } else {
    blipIndex = 5;
    updateBlipLabel();
  }

  setDailyStatus(
    hasCompleteUnsubmittedProgress
      ? "All five blips are complete. Saving today's result…"
      : "Today's study is ready. Complete all five blips to save your result."
  );

  updateDailyControls();

  return null;
}

// Date helper for consecutive-day streak calculations.
function getDateOffset(dateString, offset) {
  const date = new Date(`${dateString}T12:00:00Z`);

  date.setUTCDate(date.getUTCDate() + offset);

  return date.toISOString().slice(0, 10);
}

function calculateStreaks(history) {
  const byDate = new Map(
    history.map(day => [day.study_date, day])
  );

  const today = getTodayKey();
  const todayRecord = byDate.get(today);

  let currentStreak = 0;
  let cursor = today;

  if (!todayRecord) {
    // If today's result is not saved yet, carry yesterday's streak.
    cursor = getDateOffset(today, -1);
  } else if (!todayRecord.qualifies) {
    // A saved but non-qualifying result breaks the current streak.
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

  return {
    currentStreak,
    bestStreak
  };
}

function renderMilestones(bestStreak) {
  const milestones = [3, 7, 14, 30];
  const container = $("streakMilestones");

  container.replaceChildren();

  const highestMilestone = milestones
    .filter(target => bestStreak >= target)
    .pop();

  if (!highestMilestone) {
    container.hidden = true;
    return;
  }

  container.hidden = false;

  const badge = document.createElement("span");
  badge.className = "unlocked";
  badge.textContent = `🔥 ${highestMilestone}-day milestone`;

  container.appendChild(badge);
}

async function saveDailyResultIfComplete(refreshHistory = true) {
  if (
    dailyCompleted ||
    dailySaveInProgress ||
    !areAllBlipsFilled()
  ) {
    return;
  }

  if (!currentUser) {
    setDailyStatus(
      "All five blips are complete. Sign in to save today's result."
    );

    updateDailyControls();

    return;
  }

  const colors = getDisplayedBlipColors();

  const greenCount = colors.filter(
    color => color === "green"
  ).length;

  dailySaveInProgress = true;

  setDailyStatus("Saving today's result…");
  updateDailyControls();

  try {
    const { error } = await db
      .from("daily_blip_history")
      .upsert(
        {
          user_id: currentUser.id,
          study_date: getTodayKey(),
          green_count: greenCount,
          total_blips: 5
        },
        {
          onConflict: "user_id,study_date",
          ignoreDuplicates: true
        }
      );

    if (error) throw error;

    dailySaveInProgress = false;

    if (refreshHistory) {
      await loadDailyHistory();
    }

    await loadTodaysResult();
  } catch (error) {
    console.error("Could not save daily result:", error);

    dailySaveInProgress = false;

    setDailyStatus(
      "Couldn't save today's result. Use Reset Blips and try again.",
      true
    );

    updateDailyControls();
  }
}

// Update the progress label.
function updateBlipLabel() {
  blipContainer.setAttribute(
    "aria-label",
    `Progress: ${blipIndex} of ${blips.length}`
  );
}

// Confetti effect for a qualifying score.
function launchConfetti() {
  const colors = [
    "#ff6b6b",
    "#ffd166",
    "#06d6a0",
    "#4dabf7",
    "#c77dff",
    "#ff8fab"
  ];

  const pieceCount = 400;
  const spawnInterval = 15;

  for (let i = 0; i < pieceCount; i++) {
    setTimeout(() => {
      const piece = document.createElement("div");

      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}vw`;

      piece.style.backgroundColor =
        colors[Math.floor(Math.random() * colors.length)];

      piece.style.setProperty(
        "--drift",
        `${Math.random() * 240 - 120}px`
      );

      piece.style.setProperty(
        "--rotation",
        `${Math.random() * 1440 - 720}deg`
      );

      document.body.appendChild(piece);

      setTimeout(() => {
        piece.remove();
      }, 4000);
    }, i * spawnInterval);
  }
}

// Mark the next empty blip and save today's result when all five are done.
function markBlip(color) {
  if (
    dailyCompleted ||
    dailySaveInProgress ||
    blipIndex >= blips.length
  ) {
    return;
  }

  if (color !== "green" && color !== "red") return;

  blips[blipIndex].classList.add(color);

  blipIndex++;

  updateBlipLabel();
  updateDailyControls();

  if (areAllBlipsFilled()) {
    const greenCount = getDisplayedBlipColors().filter(
      value => value === "green"
    ).length;

    if (greenCount >= 3) {
      launchConfetti();
    }

    saveDailyResultIfComplete();
    console.trace(
  "[Daily History] Save function called",
  {
    dailyCompleted,
    dailySaveInProgress,
    allBlipsFilled: areAllBlipsFilled(),
    currentUser: currentUser?.id,
    date: getTodayKey()
  }
);
  } else {
    setDailyStatus(
      `Today's progress: ${blipIndex} of 5 blips completed.`
    );
  }
}

correctButton.addEventListener("click", () => {
  markBlip("green");
});

incorrectButton.addEventListener("click", () => {
  markBlip("red");
});

resetBlipsButton.addEventListener("click", () => {
  // This clears only the unfinished display; it never deletes history.
  if (dailyCompleted || dailySaveInProgress) return;

  clearBlipsDisplay();

  setDailyStatus("Today's unfinished progress was cleared.");
});

// Refresh the daily display when the local date changes.
setInterval(async () => {
  const today = getTodayKey();

  if (today === lastBlipDate) return;

  lastBlipDate = today;
  dailyCompleted = false;
  dailySaveInProgress = false;

  clearBlipsDisplay();
  setCurrentComboActive(false);

  if (currentUser) {
    await loadDailyHistory();
    await loadTodaysResult();
  } else {
    clearBlipsDisplay();

    setDailyStatus(
      "A new day has started. Sign in to save your daily study result."
    );
  }
}, 15000);

// Initialize the app.
updateBlipLabel();
updateDailyControls();

async function startApp() {
  if (
    SUPABASE_URL.includes("YOUR_SUPABASE") ||
    SUPABASE_KEY.includes("YOUR_SUPABASE")
  ) {
    setMessage(
      "status",
      "Add your Supabase project URL and publishable key in script.js.",
      true
    );

    $("randomButton").disabled = true;
    return;
  }

  const { data, error } = await db.auth.getSession();

  if (error) {
    setMessage("status", "Could not check sign-in status.", true);
  } else {
    await syncSession(data.session);
  }

  db.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => {
      syncSession(session);
    }, 0);
  });

  await loadCards();
}

startApp();
