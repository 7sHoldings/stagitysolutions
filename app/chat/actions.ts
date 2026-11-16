"use server";

import { createClient } from "@supabase/supabase-js";

/** Records what visitors ask the chat assistant, so unanswered questions can be added to the FAQ. */
export async function logChatQuestion(question: string, matchedFaq: string | null) {
  const q = String(question ?? "").trim().slice(0, 500);
  if (!q) return;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    await supabase.from("stagity_chat_questions").insert({
      question: q,
      matched_faq: matchedFaq ? String(matchedFaq).slice(0, 80) : null,
      answered: Boolean(matchedFaq),
    });
  } catch (e) {
    console.error("Chat question log failed:", e);
  }
}
