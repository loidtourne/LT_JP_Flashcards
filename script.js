
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
    $("definition").textContent = "No cards available";
    return;
  }

  $("kanji").textContent = card.kanji;
  $("hiragana").textContent = card.hiragana;
  $("romaji").textContent = card.romaji;
  $("class").textContent = card.class;
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
      .select("id, kanji, hiragana, romaji, class, definition, created_at")
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

async function syncSession(session) {
  currentUser = session?.user || null;

  // This only controls the interface. Database RLS is the
  // actual security boundary.
  isOwner = Boolean(
    currentUser?.email &&
    currentUser.email.toLowerCase() === OWNER_EMAIL.toLowerCase()
  );

  $("loginPanel").hidden = true;
  updateInterface();
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
      .select("id, kanji, hiragana, romaji, class, definition, created_at")
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
    // Defer UI work until after the auth callback returns.
    setTimeout(() => {
      syncSession(session);
      loadCards();
    }, 0);
  });

  await loadCards();
}

startApp();
