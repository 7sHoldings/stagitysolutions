"use server";

import { createClient } from "@supabase/supabase-js";
import { notifyNewLead } from "@/lib/notify";

export type ContactState = { status: "idle" | "ok" | "error"; message?: string };

const clip = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

export async function submitContact(_prev: ContactState, formData: FormData): Promise<ContactState> {
  // Honeypot: real people never fill this hidden field.
  if (clip(formData.get("website"), 200)) return { status: "ok" };

  const name = clip(formData.get("name"), 120);
  const email = clip(formData.get("email"), 200);
  const company = clip(formData.get("company"), 160);
  const phone = clip(formData.get("phone"), 40);
  const interest = clip(formData.get("interest"), 80);
  const message = clip(formData.get("message"), 5000);

  if (!name || !email || !message) {
    return { status: "error", message: "Please fill in your name, email and message." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "Please enter a valid email address." };
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.error("Contact form: Supabase environment variables are missing.");
    return { status: "error", message: "Sorry, the form isn't available right now. Please email us instead." };
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase
    .from("stagity_contact_submissions")
    .insert({ name, email, company, phone, interest, message });

  if (error) {
    console.error("Contact form insert failed:", error.message);
    return { status: "error", message: "Sorry, something went wrong. Please try again or email us." };
  }

  try {
    await notifyNewLead({ name, email, company, phone, interest, message });
  } catch (e) {
    // The message is already saved in Supabase, so the visitor still sees success.
    console.error("Lead email alert failed:", e);
  }

  return { status: "ok", message: "Thanks — your message is on its way. We'll get back to you within one business day." };
}
