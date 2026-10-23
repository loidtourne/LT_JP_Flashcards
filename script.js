
const SUPABASE_URL = "https://ckbasqdqtmxwrixcctca.supabase.co";
const SUPABASE_KEY = "sb_publishable_Gumosi4t5hmBCR_eiLLNNw_unIoQjo_";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const status = document.getElementById("appStatus");
const authSection = document.getElementById("authSection");
const studySection = document.getElementById("studySection");
const signInForm = document.getElementById("signInForm");
const signOutButton = document.getElementById("signOutButton");

function showSignedOut(message = "Please sign in to continue.") {
  authSection.hidden = false;
  studySection.hidden = true;
  status.textContent = message;
}

function showSignedIn(session) {
  authSection.hidden = true;
  studySection.hidden = false;
  status.textContent = `Signed in as ${session.user.email ?? "your account"}.`;
}

async function initializeApp() {
  status.textContent = "Checking your session…";

  try {
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    if (data.session) {
      showSignedIn(data.session);
    } else {
      showSignedOut();
    }
  } catch (error) {
    console.error("Session initialization failed:", error);
    status.textContent = `Unable to check session: ${error.message}`;
  }
}

signInForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  status.textContent = "Signing in…";

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error("Sign-in failed:", error);
    status.textContent = `Sign-in failed: ${error.message}`;
    return;
  }

  if (data.session) {
    showSignedIn(data.session);
  }
});

signOutButton.addEventListener("click", async () => {
  status.textContent = "Signing out…";

  const { error } = await db.auth.signOut();

  if (error) {
    console.error("Sign-out failed:", error);
    status.textContent = `Sign-out failed: ${error.message}`;
    return;
  }

  showSignedOut("Signed out successfully.");
});

db.auth.onAuthStateChange((_event, session) => {
  if (session) {
    showSignedIn(session);
  } else {
    showSignedOut();
  }
});

initializeApp();
