
const SUPABASE_URL = "https://ckbasqdqtmxwrixcctca.supabase.co";
const SUPABASE_KEY = "sb_publishable_Gumosi4t5hmBCR_eiLLNNw_unIoQjo_";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

const status = $("appStatus");
const authSection = $("authSection");
const studySection = $("studySection");
const signInForm = $("signInForm");
const signOutButton = $("signOutButton");

let currentUser = null;
let flashcards = [];
let currentCardIndex = 0;
let dailyHistory = [];
let todaysBlips = [];
let historyLoaded = false;
let savingDailyResult = false;
let celebrationShown = false;

const BLIP_TOTAL = 5;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOffset(dateKey, offset) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offset);
  return localDateKey(date);
}

function setStatus(message) {
  status.textContent = message;
}

function showSignedOut(message = "Please sign in to continue.") {
  currentUser = null;
  historyLoaded = false;
  authSection.hidden = false;
  studySection.hidden = true;
  setStatus(message);
}

function showSignedIn(session) {
  if (!session?.user) return;

  currentUser = session.user;
  authSection.hidden = true;
  studySection.hidden = false;
  setStatus(`Signed in as ${session.user.email ?? "your account"}.`);
}

async function initializeApp() {
  setStatus("Checking your session…");

  try {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;

    if (data.session) {
      await enterStudy(data.session);
    } else {
      showSignedOut();
    }
  } catch (error) {
    console.error("Session initialization failed:", error);
    setStatus(`Unable to check session: ${error.message}`);
  }
}

async function enterStudy(session) {
  showSignedIn(session);

  // Loading and sign-in only READ data. They never write daily history.
  await Promise.all([
    loadFlashcards(),
    loadDailyHistory()
  ]);
}

signInForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;

  setStatus("Signing in…");

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    if (data.session) {
      await enterStudy(data.session);
    }
  } catch (error) {
    console.error("Sign-in failed:", error);
    setStatus(`Sign-in failed: ${error.message}`);
  }
});

signOutButton.addEventListener("click", async () => {
  setStatus("Signing out…");

  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;

    showSignedOut("Signed out successfully.");
  } catch (error) {
    console.error("Sign-out failed:", error);
    setStatus(`Sign-out failed: ${error.message}`);
  }
});

// Avoid doing a second data load for the SIGNED_IN event caused by the
// sign-in form above. The form itself calls enterStudy().
db.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    showSignedOut();
  }
});

async function loadFlashcards() {
  const counter = $("cardCounter");
  counter.textContent = "Loading cards…";

  try {
    const { data, error } = await db
      .from("flashcards")
      .select("id, kanji, hiragana, romaji, class, english, definition")
      .order("id", { ascending: true });

    if (error) throw error;

    flashcards = data ?? [];
    currentCardIndex = 0;

    if (flashcards.length === 0) {
      counter.textContent = "No flashcards found.";
      clearFlashcard();
      return;
    }

    renderFlashcard();
  } catch (error) {
    console.error("Flashcard loading failed:", error);
    counter.textContent = `Unable to load cards: ${error.message}`;
  }
}

function clearFlashcard() {
  [
    "cardKanji", "cardHiragana", "cardRomaji",
    "cardClass", "cardEnglish", "cardDefinition"
  ].forEach((id) => {
    $(id).textContent = "";
  });
}

function renderFlashcard() {
  const card = flashcards[currentCardIndex];

  if (!card) {
    clearFlashcard();
    $("cardCounter").textContent = "No flashcards available.";
    return;
  }

  $("cardKanji").textContent = card.kanji ?? "";
  $("cardHiragana").textContent = card.hiragana ?? "";
  $("cardRomaji").textContent = card.romaji ?? "";
  $("cardClass").textContent = card.class ?? "";
  $("cardEnglish").textContent = card.english ?? "";
  $("cardDefinition").textContent = card.definition ?? "";

  $("cardCounter").textContent =
    `Card ${currentCardIndex + 1} of ${flashcards.length}`;

  $("flashcard").classList.remove("flipped");
}

$("flipCardButton").addEventListener("click", () => {
  $("flashcard").classList.toggle("flipped");
});

$("nextCardButton").addEventListener("click", () => {
  if (!flashcards.length) return;

  currentCardIndex = (currentCardIndex + 1) % flashcards.length;
  renderFlashcard();
});

// Make the existing CSS selectors work with the current HTML structure.
function prepareBlipElements() {
  $("flashcard").classList.add("study");

  const dots = [...document.querySelectorAll("[data-blip]")];
  $("blipDots").classList.add("blips");

  dots.forEach((dot) => dot.classList.add("blip"));

  $("greenBlipButton").classList.add("blip-button", "correct");
  $("redBlipButton").classList.add("blip-button", "incorrect");
  $("resetBlipsButton").classList.add("reset-blips-button");
}

function renderBlips() {
  const dots = [...document.querySelectorAll("[data-blip]")];

  dots.forEach((dot, index) => {
    dot.classList.remove("green", "red");

    const value = todaysBlips[index];

    if (value === "green") dot.classList.add("green");
    if (value === "red") dot.classList.add("red");
  });

  const greenCount = todaysBlips.filter((value) => value === "green").length;

  $("blipCount").textContent =
    `${todaysBlips.length} of ${BLIP_TOTAL} completed (${greenCount} green)`;

  const finished = todaysBlips.length === BLIP_TOTAL;
  $("greenBlipButton").disabled = finished || savingDailyResult;
  $("redBlipButton").disabled = finished || savingDailyResult;
}

function setBlip(value) {
  if (!currentUser || !historyLoaded || savingDailyResult) return;
  if (todaysBlips.length >= BLIP_TOTAL) return;

  todaysBlips.push(value);
  renderBlips();

  if (todaysBlips.length === BLIP_TOTAL) {
    saveDailyResultIfComplete();
  }
}

$("greenBlipButton").addEventListener("click", () => setBlip("green"));
$("redBlipButton").addEventListener("click", () => setBlip("red"));

$("resetBlipsButton").addEventListener("click", () => {
  if (savingDailyResult) return;

  // Reset only unfinished, local progress. Never delete saved history.
  const today = localDateKey();
  const alreadySaved = dailyHistory.some((row) => row.study_date === today);

  if (alreadySaved) {
    $("blipStatus").textContent =
      "Today's result is already saved and cannot be reset here.";
    return;
  }

  todaysBlips = [];
  celebrationShown = false;
  $("blipStatus").textContent = "Today's unfinished blips have been reset.";
  renderBlips();
});

async function loadDailyHistory() {
  historyLoaded = false;
  $("blipStatus").textContent = "Loading daily history…";

  try {
    const { data, error } = await db
      .from("daily_blip_history")
      .select("study_date, green_count, total_blips, qualifies, completed_at")
      .eq("user_id", currentUser.id)
      .order("study_date", { ascending: false });

    if (error) throw error;

    dailyHistory = data ?? [];

    const today = localDateKey();
    const todayRecord = dailyHistory.find((row) => row.study_date === today);

    if (todayRecord) {
      // The database record is authoritative; don't create another one.
      todaysBlips = Array.from(
        { length: Math.min(todayRecord.total_blips ?? 0, BLIP_TOTAL) },
        (_, index) => index < (todayRecord.green_count ?? 0) ? "green" : "red"
      );

      $("blipStatus").textContent =
        "Today's result is already saved. History loaded without writing.";
    } else {
      todaysBlips = [];
      $("blipStatus").textContent = "Complete five blips to save today's result.";
    }

    historyLoaded = true;
    renderBlips();
    renderDailyHistory();
    renderStreaks();
  } catch (error) {
    console.error("Daily history loading failed:", error);
    $("blipStatus").textContent = `Unable to load history: ${error.message}`;
  }
}

async function saveDailyResultIfComplete() {
  if (!currentUser || !historyLoaded || savingDailyResult) return;
  if (todaysBlips.length !== BLIP_TOTAL) return;

  const today = localDateKey();

  // Guard against a second save from this page or a date already loaded.
  if (dailyHistory.some((row) => row.study_date === today)) {
    $("blipStatus").textContent = "Today's result is already saved.";
    return;
  }

  savingDailyResult = true;
  renderBlips();

  const greenCount = todaysBlips.filter((value) => value === "green").length;
  const qualifies = greenCount === BLIP_TOTAL;

  try {
    // Ignore duplicate inserts: the UNIQUE(user_id, study_date) constraint
    // is the final protection against repeated writes.
    const { data, error } = await db
      .from("daily_blip_history")
      .upsert(
        {
          user_id: currentUser.id,
          study_date: today,
          green_count: greenCount,
          total_blips: BLIP_TOTAL,
          qualifies,
          completed_at: new Date().toISOString()
        },
        {
          onConflict: "user_id,study_date",
          ignoreDuplicates: true
        }
      )
      .select("study_date, green_count, total_blips, qualifies, completed_at");

    if (error) throw error;

    // An ignored duplicate may return no row. Reload to get the authoritative
    // database result rather than overwriting local history.
    await loadDailyHistory();

    if (data && data.length > 0 && qualifies && !celebrationShown) {
      celebrationShown = true;
      launchConfetti();
    }

    $("blipStatus").textContent =
      "Today's result has been saved or was already present in history.";
  } catch (error) {
    console.error("Daily result save failed:", error);
    $("blipStatus").textContent =
      `Save failed: ${error.message}. Your blips remain on screen; do not reset them.`;
  } finally {
    savingDailyResult = false;
    renderBlips();
  }
}

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

    const date = document.createElement("div");
    date.className = "history-date";

    const dateLabel = document.createElement("span");
    dateLabel.textContent = row.study_date;

    const details = document.createElement("small");
    details.textContent = row.qualifies ? "Qualified day" : "Not qualified";

    date.append(dateLabel, details);

    const score = document.createElement("span");
    score.className = `history-score ${
      row.qualifies ? "history-qualified" : "history-failed"
    }`;
    score.textContent = `${row.green_count ?? 0}/${row.total_blips ?? BLIP_TOTAL} green`;

    item.append(date, score);
    list.appendChild(item);
  });

  container.appendChild(list);
}

function calculateStreaks(rows) {
  const qualifiedDates = new Set(
    rows.filter((row) => row.qualifies).map((row) => row.study_date)
  );

  if (qualifiedDates.size === 0) {
    return { current: 0, highest: 0, qualifiedDates };
  }

  const today = localDateKey();
  let current = 0;
  let cursor = qualifiedDates.has(today) ? today : dateOffset(today, -1);

  while (qualifiedDates.has(cursor)) {
    current += 1;
    cursor = dateOffset(cursor, -1);
  }

  let highest = 0;
  const sortedDates = [...qualifiedDates].sort();

  let run = 0;
  let previous = null;

  for (const date of sortedDates) {
    run = previous && dateOffset(previous, 1) === date ? run + 1 : 1;
    highest = Math.max(highest, run);
    previous = date;
  }

  return { current, highest, qualifiedDates };
}

function renderStreaks() {
  const { current, highest, qualifiedDates } = calculateStreaks(dailyHistory);

  $("currentStreak").textContent = current;
  $("highestStreak").textContent = highest;

  const currentCard = document.querySelector(".current-combo-card");
  if (currentCard) currentCard.classList.toggle("active-combo", current > 0);

  renderMilestones(highest);
}

function renderMilestones(highest) {
  const section = $("streakSection");
  let milestones = section.querySelector(".streak-milestones");

  if (!milestones) {
    milestones = document.createElement("div");
    milestones.className = "streak-milestones";
    milestones.setAttribute("aria-label", "Streak milestones");
    section.appendChild(milestones);
  }

  milestones.replaceChildren();

  [3, 7, 14, 30, 60, 100, 365].forEach((target) => {
    const badge = document.createElement("span");
    badge.textContent = `${target}-day streak`;
    if (highest >= target) badge.classList.add("unlocked");
    milestones.appendChild(badge);
  });
}

function launchConfetti() {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (reducedMotion) return;

  const colors = ["#35c76f", "#d7b98e", "#ef5350", "#ffab40", "#7eafff"];

  for (let index = 0; index < 55; index++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.backgroundColor = colors[index % colors.length];
    piece.style.setProperty("--drift", `${Math.random() * 220 - 110}px`);
    piece.style.setProperty("--rotation", `${Math.random() * 1080}deg`);
    piece.style.animationDelay = `${Math.random() * 0.7}s`;
    document.body.appendChild(piece);

    piece.addEventListener("animationend", () => piece.remove(), { once: true });
  }
}

prepareBlipElements();
initializeApp();
