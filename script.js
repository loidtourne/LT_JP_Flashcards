
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

  $("cardCount").textContent = `${cards.length} card${cards.length === 1 ? "" : "s"}`;
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
    setMessage("status", "No vocabulary yet. Add your first card when signed in.");
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
      .select("id, kanji, hiragana, romaji, class, english, definition, created_at")
      .order("created_at", { ascending: true });

    if (error) throw error;

    cards = data || [];
    updateInterface();

    if (cards.length > 0) {
      chooseRandomCard();
    } else {
      renderCard(null);
      setMessage("status", "Your vocabulary is empty. Sign in to add your first card.");
    }
  } catch (error) {
    console.error("Could not load flashcards:", error);
    setMessage("status", "Couldn't load cards. Check your connection and Supabase settings.", true);
  } finally {
    $("randomButton").disabled = false;
  }
}


async function loadDailyHistory() {
  if (!currentUser) {
    $("currentStreak").textContent = "0 days";
    $("bestStreak").textContent = "0 days";
    renderMilestones(0);
    return;
  }

  const { data, error } = await db
    .from("daily_blip_history")
    .select("study_date, green_count, qualifies")
    .eq("user_id", currentUser.id)
    .order("study_date", { ascending: false });

  if (error) {
    console.error("Could not load daily history:", error);
    return;
  }

  const history = data || [];
  const { currentStreak, bestStreak } =
    calculateStreaks(history);

  $("currentStreak").textContent =
    `${currentStreak} day${currentStreak === 1 ? "" : "s"}`;

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

  if (currentUser) {
    // Load history first, then save today's result if it is complete.
    await loadDailyHistory();
    await saveDailyResultIfComplete();
  } else {
    await loadDailyHistory();
  }
}


flashcard.addEventListener("click", () => {
  if (!currentCard) return;

  flashcard.classList.toggle("flipped");
  flashcard.setAttribute(
    "aria-pressed",
    String(flashcard.classList.contains("flipped"))
  );
});

$("randomButton").addEventListener("click", chooseRandomCard);

$("authButton").addEventListener("click", async () => {
  if (busy) return;

  if (currentUser) {
    busy = true;
    try {
      const { error } = await db.auth.signOut();
      if (error) throw error;
      setMessage("status", "Signed out.");
    } catch (error) {
      setMessage("status", error.message || "Sign out failed.", true);
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
  const submit = $("loginForm").querySelector('button[type="submit"]');
  submit.disabled = true;
  setMessage("loginMessage", "Signing in…");

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email: $("email").value.trim(),
      password: $("password").value
    });

    if (error) throw error;

    if (data.user?.email?.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
      await db.auth.signOut();
      throw new Error("This account is not authorized to manage vocabulary.");
    }

    $("password").value = "";
    $("loginPanel").hidden = true;
    setMessage("status", "Signed in successfully.");
  } catch (error) {
    setMessage("loginMessage", error.message || "Sign-in failed.", true);
  } finally {
    busy = false;
    submit.disabled = false;
  }
});

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
    setMessage("saveMessage", "Please sign in with your authorized account.", true);
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
    setMessage("saveMessage", "Please complete all four fields.", true);
    return;
  }

  busy = true;
  const saveButton = $("addForm").querySelector('button[type="submit"]');
  saveButton.disabled = true;
  setMessage("saveMessage", "Saving card…");

  try {
    const { data, error } = await db
      .from("flashcards")
      .insert(newCard)
      .select("id, kanji, hiragana, romaji, class, english, definition, created_at")
      .single();

    if (error) throw error;

    // Add the confirmed database result to the live list.
    cards.push(data);
    updateInterface();
    renderCard(data);

    $("addForm").reset();
    $("addPanel").hidden = true;
    setMessage("status", `Saved "${data.kanji}". Your new card is ready!`);
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

async function startApp() {
  if (
    SUPABASE_URL.includes("YOUR_SUPABASE") ||
    SUPABASE_KEY.includes("YOUR_SUPABASE")
  ) {
    setMessage("status", "Add your Supabase project URL and publishable key in script.js.", true);
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



const blips = document.querySelectorAll(".blip");
const blipContainer = document.getElementById("blips");
const correctButton = document.getElementById("correctButton");
const incorrectButton = document.getElementById("incorrectButton");

const BLIP_STORAGE_KEY = "japaneseFlashcardBlips";

let blipIndex = 0;

// Get today's local date, such as 2026-10-20
function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Restore today's saved blips


function restoreBlips() {
  let saved = {};

  try {
    saved = JSON.parse(
      localStorage.getItem(BLIP_STORAGE_KEY) || "{}"
    );
  } catch (error) {
    console.error("Could not restore saved blips:", error);
  }

  blips.forEach(blip => {
    blip.classList.remove("green", "red");
  });

  blipIndex = 0;

  if (saved.date !== getTodayKey()) {
    localStorage.setItem(
      BLIP_STORAGE_KEY,
      JSON.stringify({
        date: getTodayKey(),
        colors: []
      })
    );

    updateBlipLabel();
    return;
  }

  const colors = Array.isArray(saved.colors)
    ? saved.colors
    : [];

  for (let i = 0; i < Math.min(colors.length, blips.length); i++) {
    if (colors[i] !== "green" && colors[i] !== "red") {
      break;
    }

    blips[i].classList.add(colors[i]);
    blipIndex++;
  }

  updateBlipLabel();
}


  
function getDateOffset(dateString, offset) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function formatStudyDate(dateString) {
  // Use midday to avoid shifting dates because of timezone offsets.
  return new Date(`${dateString}T12:00:00`).toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric"
    }
  );
}

function calculateStreaks(history) {
  const byDate = new Map(
    history.map(day => [day.study_date, day])
  );

  const today = getTodayKey();
  const todayRecord = byDate.get(today);

  // A completed, non-qualifying day breaks the current combo.
  let currentStreak = 0;
  let cursor = today;

  if (!todayRecord) {
    // If today isn't completed yet, continue from yesterday.
    cursor = getDateOffset(today, -1);
  } else if (!todayRecord.qualifies) {
    cursor = null;
  }

  while (cursor && byDate.get(cursor)?.qualifies) {
    currentStreak++;
    cursor = getDateOffset(cursor, -1);
  }

  // Calculate the best-ever streak across all saved dates.
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

function renderDailyHistory(history) {
  const list = $("dailyHistory");
  list.replaceChildren();

  if (history.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No completed study days yet.";
    list.appendChild(item);
    return;
  }

  // Most recent days first.
  history.slice(0, 30).forEach(day => {
    const item = document.createElement("li");

    const dateBlock = document.createElement("div");
    dateBlock.className = "history-date";

    const date = document.createElement("strong");
    date.textContent = formatStudyDate(day.study_date);

    const detail = document.createElement("small");
    detail.textContent = day.qualifies
      ? "Streak day earned"
      : "Streak broken";

    dateBlock.append(date, detail);

    const score = document.createElement("span");
    score.className = "history-score " +
      (day.qualifies ? "history-qualified" : "history-failed");
    score.textContent = `${day.green_count}/5 green`;

    item.append(dateBlock, score);
    list.appendChild(item);
  });
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

async function loadDailyHistory() {
  if (!currentUser) {
    $("currentStreak").textContent = "0 days";
    $("bestStreak").textContent = "0 days";
    renderMilestones(0);
    return;
  }

  const { data, error } = await db
    .from("daily_blip_history")
    .select("study_date, green_count, qualifies")
    .eq("user_id", currentUser.id)
    .order("study_date", { ascending: false });

  if (error) {
    console.error("Could not load daily history:", error);
    return;
  }

  const history = data || [];

  const { currentStreak, bestStreak } =
    calculateStreaks(history);

  $("currentStreak").textContent =
    `${currentStreak} day${currentStreak === 1 ? "" : "s"}`;

  $("bestStreak").textContent =
    `${bestStreak} day${bestStreak === 1 ? "" : "s"}`;

  renderMilestones(bestStreak);
}


async function saveDailyResultIfComplete(refreshHistory = true) {
  // Do not save partial study sessions.
  const colors = Array.from(blips).map(blip => {
    if (blip.classList.contains("green")) return "green";
    if (blip.classList.contains("red")) return "red";
    return null;
  });

  const allFilled = colors.length === 5 &&
    colors.every(color => color === "green" || color === "red");

  if (!allFilled) return;

  if (!currentUser) {
    $("streakMessage").textContent =
      "Today's blips are complete. Sign in to save the score to your history.";
    return;
  }

  const greenCount = colors.filter(color => color === "green").length;

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

  if (error) {
    console.error("Could not save daily result:", error);
    $("streakMessage").textContent =
      "Today's score couldn't be saved. Check your connection and try again.";
    return;
  }

  if (refreshHistory) {
    await loadDailyHistory();
  }
}


// Update the progress label
function updateBlipLabel() {
  blipContainer.setAttribute(
    "aria-label",
    `Progress: ${blipIndex} of ${blips.length}`
  );
}



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
  const spawnInterval = 15; // Milliseconds between pieces

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



// Mark the next empty blip and save it
function markBlip(color) {
  if (blipIndex >= blips.length) return;

  blips[blipIndex].classList.add(color);
  blipIndex++;

  const colors = Array.from(blips).map(blip => {
    if (blip.classList.contains("green")) return "green";
    if (blip.classList.contains("red")) return "red";
    return null;
  });


  localStorage.setItem(
    BLIP_STORAGE_KEY,
    JSON.stringify({
      date: getTodayKey(),
      colors: colors
    })
  );

  updateBlipLabel();

  const allBlipsFilled = colors.every(
    color => color === "green" || color === "red"
  );

  const greenCount = colors.filter(
    color => color === "green"
  ).length;

  if (allBlipsFilled) {
    // Save every completed day, including scores below 3.
    // Low scores are needed to record streak breaks.
    saveDailyResultIfComplete();

    // Preserve your existing confetti rule.
    if (greenCount >= 3) {
      launchConfetti();
    }
  }
}



correctButton.addEventListener("click", () => {
  markBlip("green");
});

incorrectButton.addEventListener("click", () => {
  markBlip("red");
});

resetBlipsButton.addEventListener("click", () => {
  // Clear all blip colors
  blips.forEach(blip => {
    blip.classList.remove("green", "red");
  });

  // Reset the progress counter
  blipIndex = 0;

  // Save the empty state for today
  localStorage.setItem(
    BLIP_STORAGE_KEY,
    JSON.stringify({
      date: getTodayKey(),
      colors: []
    })
  );

  // Update the accessibility label
  updateBlipLabel();
});

// Restore saved progress when the app loads
restoreBlips();

startApp();
