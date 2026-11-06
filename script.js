/* Japanese Flashcards — Supabase relational reading system. */

const SUPABASE_URL = "https://ckbasqdqtmxwrixcctca.supabase.co";
const SUPABASE_KEY = "sb_publishable_Gumosi4t5hmBCR_eiLLNNw_unIoQjo_";
const OWNER_EMAIL = "loidtourne@gmail.com";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);

let cards = [];
let currentCard = null;
let currentUser = null;
let isOwner = false;
let busy = false;
let blipIndex = 0;
let dailyCompleted = false;
let dailySaveInProgress = false;
let lastBlipDate = getTodayKey();

const flashcard = $("flashcard");
const blips = document.querySelectorAll(".blip");
const blipContainer = $("blips");
const correctButton = $("correctButton");
const incorrectButton = $("incorrectButton");
const resetBlipsButton = $("resetBlipsButton");

const CARD_SELECT = `
  id, kanji, meaning, created_at,
  kanji_readings (
    id, reading_type, reading, romaji,
    kanji_examples ( id, word, kana, romaji, definition )
  )
`;

function setMessage(id, message, isError = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.classList.toggle("error-message", Boolean(isError));
}

function updateInterface() {
  $("authButton").textContent = currentUser ? "Sign out" : "Sign in";

  $("accountStatus").textContent = currentUser
    ? (isOwner ? "Signed in as owner" : "Signed in")
    : "Study mode";

  $("addButton").hidden = !isOwner;

  if (!isOwner) {
    $("addPanel").hidden = true;
  }

  $("cardCount").textContent =
    `${cards.length} card${cards.length === 1 ? "" : "s"}`;
}

function makeTextElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  element.textContent = text ?? "";

  return element;
}

/* --------------------------------------------------
   CARD DISPLAY
-------------------------------------------------- */

function renderReadingColumn(type, readings) {
  const section = makeTextElement("section", "reading-column");

  const heading = document.createElement("h3");

  heading.append(
    document.createTextNode(
      type === "onyomi" ? "On'yomi " : "Kun'yomi "
    )
  );

  heading.append(
    makeTextElement(
      "span",
      "reading-japanese-label",
      type === "onyomi" ? "音読み" : "訓読み"
    )
  );

  section.appendChild(heading);

  if (!readings.length) {
    section.appendChild(
      makeTextElement("p", "empty-readings", "—")
    );

    return section;
  }

  readings.forEach(reading => {
    const item = makeTextElement("article", "reading-item");

    item.appendChild(
      makeTextElement("p", "reading-kana", reading.reading)
    );

    item.appendChild(
      makeTextElement("p", "reading-romaji", reading.romaji)
    );

    const examples = Array.isArray(reading.kanji_examples)
      ? reading.kanji_examples
      : [];

    if (examples.length) {
      const details = document.createElement("details");
      details.className = "examples-details";

      const summary = makeTextElement(
        "summary",
        "examples-summary",
        `Examples (${examples.length})`
      );

      details.appendChild(summary);

      const list = makeTextElement("div", "example-list");

      examples.forEach(example => {
        const exampleItem = makeTextElement(
          "div",
          "example-item"
        );

        exampleItem.appendChild(
          makeTextElement("strong", "example-word", example.word)
        );

        exampleItem.appendChild(
          makeTextElement("p", "example-kana", example.kana)
        );

        exampleItem.appendChild(
          makeTextElement("p", "example-romaji", example.romaji)
        );

        if (example.definition) {
          exampleItem.appendChild(
            makeTextElement(
              "p",
              "example-definition",
              example.definition
            )
          );
        }

        list.appendChild(exampleItem);
      });

      details.appendChild(list);
      item.appendChild(details);
    } else {
      item.appendChild(
        makeTextElement("p", "no-examples", "No examples yet")
      );
    }

    section.appendChild(item);
  });

  return section;
}

function renderCard(card) {
  currentCard = card;

  flashcard.classList.remove("flipped");

  flashcard.setAttribute(
    "aria-label",
    card
      ? `Kanji ${card.kanji}. Press Enter or Space to flip.`
      : "No flashcards available."
  );

  $("kanji").textContent = card?.kanji || "日本語";

  $("meaningFront").textContent =
    card?.meaning || (card ? "" : "No cards available");

  const columns = $("readingColumns");

  columns.replaceChildren();

  const readings = card?.kanji_readings || [];

  const onyomi = readings.filter(
    item => item.reading_type === "onyomi"
  );

  const kunyomi = readings.filter(
    item => item.reading_type === "kunyomi"
  );

  columns.append(
    renderReadingColumn("onyomi", onyomi),
    renderReadingColumn("kunyomi", kunyomi)
  );
}

function flipCard() {
  if (!currentCard) return;

  flashcard.classList.toggle("flipped");
}

flashcard.addEventListener("click", event => {
  if (
    event.target.closest(
      "details, summary, a, button, input, textarea"
    )
  ) {
    return;
  }

  flipCard();
});

flashcard.addEventListener("keydown", event => {
  if (event.target !== flashcard) return;

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    flipCard();
  }
});

/* --------------------------------------------------
   RANDOM CARD
-------------------------------------------------- */

function chooseRandomCard() {
  if (!cards.length) {
    renderCard(null);

    setMessage(
      "status",
      "No cards available. Sign in to add your first kanji."
    );

    return;
  }

  let candidates = cards;

  if (currentCard && cards.length > 1) {
    candidates = cards.filter(
      card => card.id !== currentCard.id
    );
  }

  const next = candidates[
    Math.floor(Math.random() * candidates.length)
  ];

  renderCard(next);

  setMessage("status", "Ready to study.");
}

/* --------------------------------------------------
   LOAD FLASHCARDS
-------------------------------------------------- */

async function loadCards() {
  setMessage("status", "Loading vocabulary…");

  $("randomButton").disabled = true;

  try {
    const { data, error } = await db
      .from("flashcards")
      .select(CARD_SELECT)
      .order("created_at", { ascending: true });

    if (error) throw error;

    cards = (data || []).map(card => ({
      ...card,

      kanji_readings: (card.kanji_readings || []).map(reading => ({
        ...reading,
        kanji_examples: reading.kanji_examples || []
      }))
    }));

    updateInterface();

    if (cards.length) {
      chooseRandomCard();
    } else {
      renderCard(null);

      setMessage(
        "status",
        "Your vocabulary is empty. Sign in to add your first kanji."
      );
    }
  } catch (error) {
    console.error("Could not load flashcards:", error);

    setMessage(
      "status",
      `Couldn't load cards: ${
        error.message || "Check your Supabase tables and permissions."
      }`,
      true
    );
  } finally {
    $("randomButton").disabled = false;
  }
}

/* --------------------------------------------------
   AUTHENTICATION
-------------------------------------------------- */

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

$("loginForm").addEventListener("submit", async event => {
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

/* --------------------------------------------------
   READING AND EXAMPLE EDITOR
-------------------------------------------------- */

let editorReadingId = 0;

function createField(labelText, placeholder, className = "") {
  const wrap = makeTextElement(
    "label",
    `editor-field ${className}`.trim()
  );

  wrap.appendChild(
    makeTextElement("span", "", labelText)
  );

  const input = document.createElement("input");

  input.type = "text";
  input.placeholder = placeholder;
  input.maxLength = labelText === "Definition" ? 500 : 160;

  wrap.appendChild(input);

  return { wrap, input };
}

function addExampleEditor(examplesContainer) {
  const row = makeTextElement("div", "example-editor");

  const word = createField("Word", "外国人");
  const kana = createField("Kana", "がいこくじん");
  const romaji = createField("Romaji", "gaikokujin");

  const definition = createField(
    "Definition",
    "Foreigner",
    "definition-field"
  );

  row.append(
    word.wrap,
    kana.wrap,
    romaji.wrap,
    definition.wrap
  );

  const remove = makeTextElement(
    "button",
    "remove-editor-button",
    "Remove example"
  );

  remove.type = "button";

  remove.addEventListener("click", () => {
    row.remove();
  });

  row.appendChild(remove);

  examplesContainer.appendChild(row);
}

function addReadingEditor(type) {
  const readingId = ++editorReadingId;

  const container = $(
    type === "onyomi" ? "onyomiEditors" : "kunyomiEditors"
  );

  const card = makeTextElement("div", "reading-editor");

  card.dataset.readingType = type;
  card.dataset.readingId = String(readingId);

  const fields = makeTextElement(
    "div",
    "reading-editor-fields"
  );

  const reading = createField(
    "Reading",
    type === "onyomi" ? "ジン" : "ひと"
  );

  reading.input.dataset.field = "reading";

  const romaji = createField(
    "Romaji",
    type === "onyomi" ? "jin" : "hito"
  );

  romaji.input.dataset.field = "romaji";

  fields.append(reading.wrap, romaji.wrap);

  card.appendChild(fields);

  const examplesHeader = makeTextElement(
    "div",
    "examples-editor-heading"
  );

  examplesHeader.appendChild(
    makeTextElement("span", "", "Vocabulary examples")
  );

  const addExample = makeTextElement(
    "button",
    "small-secondary",
    "+ Add example"
  );

  addExample.type = "button";

  const examples = makeTextElement(
    "div",
    "example-editors"
  );

  addExample.addEventListener("click", () => {
    addExampleEditor(examples);
  });

  examplesHeader.appendChild(addExample);

  card.append(examplesHeader, examples);

  const removeReading = makeTextElement(
    "button",
    "remove-editor-button",
    "Remove reading"
  );

  removeReading.type = "button";

  removeReading.addEventListener("click", () => {
    card.remove();
  });

  card.appendChild(removeReading);

  container.appendChild(card);
}

document.querySelectorAll("[data-add-reading]").forEach(button => {
  button.addEventListener("click", () => {
    addReadingEditor(button.dataset.addReading);
  });
});

function collectReadingEditors() {
  const result = [];

  document.querySelectorAll(".reading-editor").forEach(editor => {
    const reading = editor
      .querySelector('[data-field="reading"]')
      .value.trim();

    const romaji = editor
      .querySelector('[data-field="romaji"]')
      .value.trim();

    if (!reading && !romaji) return;

    if (!reading || !romaji) {
      throw new Error(
        "Complete both the reading and romaji for every reading entry."
      );
    }

    const examples = [];

    editor.querySelectorAll(".example-editor").forEach(example => {
      const values = Array.from(
        example.querySelectorAll("input")
      ).map(input => input.value.trim());

      if (values.every(value => !value)) return;

      if (values.slice(0, 3).some(value => !value)) {
        throw new Error(
          "Complete Word, Kana, and Romaji for each example, or remove the blank example."
        );
      }

      examples.push({
        word: values[0],
        kana: values[1],
        romaji: values[2],
        definition: values[3] || null
      });
    });

    result.push({
      reading_type: editor.dataset.readingType,
      reading,
      romaji,
      examples
    });
  });

  if (!result.length) {
    throw new Error(
      "Add at least one On'yomi or Kun'yomi reading."
    );
  }

  return result;
}

/* --------------------------------------------------
   ADD / CANCEL KANJI
-------------------------------------------------- */

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

  $("onyomiEditors").replaceChildren();
  $("kunyomiEditors").replaceChildren();

  setMessage("saveMessage", "");
});

/* --------------------------------------------------
   SAVE KANJI, READINGS AND EXAMPLES
-------------------------------------------------- */

$("addForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!isOwner || !currentUser || busy) {
    setMessage(
      "saveMessage",
      "Please sign in with your authorized account.",
      true
    );

    return;
  }

  const kanji = $("newKanji").value.trim();
  const meaning = $("newMeaning").value.trim();

  if (!kanji || !meaning) {
    setMessage(
      "saveMessage",
      "Enter both the kanji and its meaning.",
      true
    );

    return;
  }

  let readings;

  try {
    readings = collectReadingEditors();
  } catch (error) {
    setMessage("saveMessage", error.message, true);
    return;
  }

  busy = true;

  const saveButton = $("addForm").querySelector(
    'button[type="submit"]'
  );

  saveButton.disabled = true;

  setMessage("saveMessage", "Saving kanji and readings…");

  let createdCard = null;

  try {
    const { data: card, error: cardError } = await db
      .from("flashcards")
      .insert({ kanji, meaning })
      .select("id, kanji, meaning, created_at")
      .single();

    if (cardError) throw cardError;

    createdCard = card;

    const savedReadings = [];

    for (const item of readings) {
      const { data: savedReading, error: readingError } = await db
        .from("kanji_readings")
        .insert({
          flashcard_id: card.id,
          reading_type: item.reading_type,
          reading: item.reading,
          romaji: item.romaji
        })
        .select("id, reading_type, reading, romaji")
        .single();

      if (readingError) throw readingError;

      const savedExamples = [];

      if (item.examples.length) {
        const rows = item.examples.map(example => ({
          reading_id: savedReading.id,
          ...example
        }));

        const { data: examples, error: examplesError } = await db
          .from("kanji_examples")
          .insert(rows)
          .select("id, word, kana, romaji, definition");

        if (examplesError) throw examplesError;

        savedExamples.push(...(examples || []));
      }

      savedReadings.push({
        ...savedReading,
        kanji_examples: savedExamples
      });
    }

    const completeCard = {
      ...card,
      kanji_readings: savedReadings
    };

    cards.push(completeCard);

    updateInterface();
    renderCard(completeCard);

    $("addForm").reset();

    $("onyomiEditors").replaceChildren();
    $("kunyomiEditors").replaceChildren();

    $("addPanel").hidden = true;

    setMessage(
      "status",
      `Saved "${kanji}". Your new kanji is ready!`
    );

    setMessage("saveMessage", "");
  } catch (error) {
    console.error("Could not save kanji:", error);

    if (createdCard?.id) {
      // Best-effort cleanup if a related insert failed partway through.
      await db
        .from("kanji_readings")
        .delete()
        .eq("flashcard_id", createdCard.id);

      await db
        .from("flashcards")
        .delete()
        .eq("id", createdCard.id);
    }

    setMessage(
      "saveMessage",
      `Couldn't save this kanji: ${
        error.message ||
        "Check Supabase permissions and table relationships."
      }`,
      true
    );
  } finally {
    busy = false;
    saveButton.disabled = false;
  }
});

/* --------------------------------------------------
   DAILY BLIPS AND STREAKS
   Supabase is the source of truth.
-------------------------------------------------- */

function getTodayKey() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function setDailyStatus(message, isError = false) {
  // Daily status text is intentionally not displayed in the current layout.
}

function getDisplayedBlipColors() {
  return Array.from(blips).map(blip =>
    blip.classList.contains("green")
      ? "green"
      : blip.classList.contains("red")
        ? "red"
        : null
  );
}

function areAllBlipsFilled() {
  const colors = getDisplayedBlipColors();

  return (
    colors.length === 5 &&
    colors.every(color => color === "green" || color === "red")
  );
}

function updateBlipLabel() {
  blipContainer.setAttribute(
    "aria-label",
    `Progress: ${blipIndex} of ${blips.length}`
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

  resetBlipsButton.disabled =
    dailyCompleted || dailySaveInProgress;
}

function setCurrentComboActive(active) {
  document
    .querySelector(".current-combo-card")
    ?.classList.toggle("active-combo", Boolean(active));
}

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
    cursor = getDateOffset(today, -1);
  } else if (!todayRecord.qualifies) {
    cursor = null;
  }

  while (cursor && byDate.get(cursor)?.qualifies) {
    currentStreak++;

    cursor = getDateOffset(cursor, -1);
  }

  const sorted = [...history].sort(
    (a, b) => a.study_date.localeCompare(b.study_date)
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

    running =
      previousDate &&
      getDateOffset(previousDate, 1) === day.study_date
        ? running + 1
        : 1;

    bestStreak = Math.max(bestStreak, running);

    previousDate = day.study_date;
  }

  return { currentStreak, bestStreak };
}

function renderMilestones(bestStreak) {
  const milestones = [3, 7, 14, 30];

  const container = $("streakMilestones");

  container.replaceChildren();

  const highest = milestones
    .filter(value => bestStreak >= value)
    .pop();

  container.hidden = !highest;

  if (highest) {
    const badge = makeTextElement(
      "span",
      "unlocked",
      `🔥 ${highest}-day milestone`
    );

    container.appendChild(badge);
  }
}

async function loadDailyHistory() {
  if (!currentUser) {
    $("currentStreak").textContent = "🔥 0 days";
    $("bestStreak").textContent = "0 days";

    setCurrentComboActive(false);
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

  const todayRecord = history.find(
    day => day.study_date === getTodayKey()
  );

  const todayQualifies = Boolean(
    todayRecord &&
    Number(todayRecord.total_blips ?? 5) === 5 &&
    (
      todayRecord.qualifies ??
      Number(todayRecord.green_count) >= 3
    )
  );

  setCurrentComboActive(todayQualifies);

  const { currentStreak, bestStreak } =
    calculateStreaks(history);

  $("currentStreak").textContent =
    `🔥 ${currentStreak} day${currentStreak === 1 ? "" : "s"}`;

  $("bestStreak").textContent =
    `${bestStreak} day${bestStreak === 1 ? "" : "s"}`;

  renderMilestones(bestStreak);
}

async function loadTodaysResult({
  preserveUnsubmittedProgress = false
} = {}) {
  if (!currentUser) {
    dailyCompleted = false;

    clearBlipsDisplay();
    updateDailyControls();

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
    return null;
  }

  if (data) {
    dailyCompleted = true;

    blips.forEach(blip => {
      blip.classList.remove("green", "red");
    });

    blipIndex = 5;

    updateBlipLabel();
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

  updateDailyControls();

  return null;
}

async function saveDailyResultIfComplete() {
  if (
    dailyCompleted ||
    dailySaveInProgress ||
    !areAllBlipsFilled()
  ) {
    return;
  }

  if (!currentUser) {
    updateDailyControls();
    return;
  }

  const greenCount = getDisplayedBlipColors().filter(
    color => color === "green"
  ).length;

  dailySaveInProgress = true;

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

    await loadDailyHistory();
    await loadTodaysResult();
  } catch (error) {
    console.error("Could not save daily result:", error);

    dailySaveInProgress = false;

    updateDailyControls();
  }
}

/* --------------------------------------------------
   CONFETTI
-------------------------------------------------- */

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

      setTimeout(() => piece.remove(), 5000);
    }, i * spawnInterval);
  }
}

/* --------------------------------------------------
   BLIP INTERACTIONS
-------------------------------------------------- */

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
  }
}

randomButton.addEventListener("click", () => {
  chooseRandomCard();
});

correctButton.addEventListener("click", () => {
  markBlip("green");
  chooseRandomCard();
});

incorrectButton.addEventListener("click", () => {
  markBlip("red");
  chooseRandomCard();
});

resetBlipsButton.addEventListener("click", () => {
  if (dailyCompleted || dailySaveInProgress) return;

  clearBlipsDisplay();
});

/* --------------------------------------------------
   AUTH SESSION SYNC
-------------------------------------------------- */

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
    await loadTodaysResult({
      preserveUnsubmittedProgress: true
    });

    if (!dailyCompleted && areAllBlipsFilled()) {
      await saveDailyResultIfComplete();
    }
  } else {
    dailyCompleted = false;

    clearBlipsDisplay();
    setCurrentComboActive(false);
    updateDailyControls();
  }
}

/* --------------------------------------------------
   AUTOMATIC NEW-DAY RESET
-------------------------------------------------- */

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
  }
}, 15000);

/* --------------------------------------------------
   INITIALIZE APP
-------------------------------------------------- */

async function startApp() {
  try {
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    await syncSession(data.session);

    db.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => syncSession(session), 0);
    });

    await loadCards();
  } catch (error) {
    console.error("Could not initialize app:", error);

    setMessage(
      "status",
      `Could not connect to Supabase: ${
        error.message || "Check your settings."
      }`,
      true
    );

    $("randomButton").disabled = true;
  }
}

updateBlipLabel();
updateDailyControls();

startApp();
