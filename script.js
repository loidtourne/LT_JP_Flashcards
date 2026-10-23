
const SUPABASE_URL = "https://ckbasqdqtmxwrixcctca.supabase.co";
const SUPABASE_KEY = "sb_publishable_Gumosi4t5hmBCR_eiLLNNw_unIoQjo_";

const status = document.getElementById("appStatus");

async function initializeApp() {
  try {
    if (!window.supabase) {
      throw new Error("Supabase library did not load.");
    }

    const db = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );

    status.textContent = "Checking Supabase connection…";

    const { error } = await db
      .from("flashcards")
      .select("id")
      .limit(1);

    if (error) {
      throw error;
    }

    status.textContent = "Supabase connected successfully.";

  } catch (error) {
    console.error("Initialization failed:", error);
    status.textContent = `Connection failed: ${error.message}`;
  }
}

initializeApp();
