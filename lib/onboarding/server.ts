import "server-only";
import { audit, db, decryptJson, encryptJson, siteOrigin } from "@/lib/i9/server";
import { send } from "@/lib/i9/mail";
import { company } from "@/lib/content";

export const OB_BUCKET = "onboarding";

/** The Stagity "Employee Personal Information" form. Contains SSN and DOB, so it's encrypted at rest. */
export type Personal = {
  firstName: string; middleInitial: string; lastName: string;
  street: string; apt: string; city: string; state: string; zip: string;
  ssn: string; dob: string;
  workStatus: string; statusNumber: string; statusExpires: string;
  cellPhone: string; homePhone: string; personalEmail: string;
  workAddress: string; workPhone: string; workEmail: string;
};

/** Form W-4 answers (name, SSN and address come from the Personal Information form). */
export type W4 = {
  filingStatus: "single" | "married_joint" | "head";
  multipleJobs: boolean;               // Step 2(c)
  childrenAmount: number;              // Step 3(a): qualifying children × $2,200 (2026)
  otherDependentsAmount: number;       // Step 3(b): other dependents × $500
  children?: number; otherDependents?: number;
  otherIncome: number;                 // Step 4(a)
  deductions: number;                  // Step 4(b)
  extraWithholding: number;            // Step 4(c)
  exempt: boolean;
  signedName: string; signedAt: string;
};

export type Deposit = {
  bankName: string; bankState: string; accountType: "checking" | "savings"; routing: string; account: string;
  signedName: string; signedAt: string;
};

export const WORK_STATUSES: { value: string; label: string }[] = [
  { value: "citizen", label: "U.S. citizen" },
  { value: "green_card", label: "Permanent resident (green card)" },
  { value: "opt", label: "OPT / STEM OPT (EAD)" },
  { value: "ead", label: "EAD (other category)" },
  { value: "h1b", label: "H-1B" },
  { value: "other", label: "Other" },
];

export const FILE_KINDS: Record<string, string> = {
  ssn_card: "Social Security card (copy)",
  drivers_license: "Driver's license (copy)",
  voided_check: "Voided check (or bank letter)",
  i94: "I-94",
  passport: "Passport (copy)",
  visa: "Visa (copy)",
  ead: "EAD card",
  green_card: "Green card",
  edu_10th: "10th certificate",
  edu_inter: "Inter / 12th certificate",
  edu_bachelors: "Bachelor's degree certificate",
  edu_masters: "Master's degree certificate",
  resume: "Resume",
  other: "Other document",
};

/** Which documents each person must upload, following the Stagity new-hire email. */
export function requiredDocs(workStatus: string | null): string[] {
  const base = ["ssn_card", "drivers_license", "voided_check", "edu_10th", "edu_inter", "edu_bachelors"];
  switch (workStatus) {
    case "citizen": return base;
    case "green_card": return [...base, "green_card"];
    case "opt": case "ead": return [...base, "passport", "i94", "ead"];
    case "h1b": return [...base, "passport", "visa", "i94"];
    default: return [...base, "passport", "i94"];
  }
}
/** Shown but not required. */
export const OPTIONAL_DOCS = ["edu_masters", "visa", "resume", "other"];

export type Onboarding = {
  person_id: string; started_at: string; started_by: string; due_date: string | null; completed_at: string | null;
  w4_enc: string | null; w4_submitted_at: string | null; deposit_enc: string | null; deposit_last4: string | null; deposit_submitted_at: string | null;
  work_status: string | null; docs_submitted_at: string | null; returned_note: string | null; returned_items: string[] | null;
  personal_enc: string | null; personal_submitted_at: string | null;
};

export const encryptPersonal = (p: Personal) => encryptJson(p);
export const decryptPersonal = (s: string | null) => decryptJson<Personal>(s);
export const encryptW4 = (w: W4) => encryptJson(w);
export const decryptW4 = (s: string | null) => decryptJson<W4>(s);
export const encryptDeposit = (d: Deposit) => encryptJson(d);
export const decryptDeposit = (s: string | null) => decryptJson<Deposit>(s);

/** ABA routing number checksum (3-7-1 weights). */
export function validRouting(r: string) {
  if (!/^\d{9}$/.test(r)) return false;
  const d = r.split("").map(Number);
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
}

export type Step = { key: string; label: string; done: boolean; href: string; optional?: boolean; detail?: string };

/** Everything the person has to do, and what's done. Used by the portal checklist, the HR tracker and reminders. */
export async function onboardingSteps(personId: string) {
  const [{ data: ob }, { data: person }, { data: files }, { data: sigs }, { data: i9 }] = await Promise.all([
    db().from("stagity_onboarding").select("*").eq("person_id", personId).maybeSingle(),
    db().from("stagity_people").select("profile_completed_at").eq("id", personId).single(),
    db().from("stagity_onboarding_files").select("kind").eq("person_id", personId),
    db().from("stagity_signatures").select("id, title, status").eq("person_id", personId).neq("status", "cancelled").order("requested_at"),
    db().from("stagity_i9_cases").select("status").eq("person_id", personId).neq("status", "cancelled").limit(1).maybeSingle(),
  ]);
  if (!ob) return null;
  const o = ob as Onboarding;
  const kinds = new Set((files ?? []).map((f) => f.kind));
  const missingDocs = requiredDocs(o.work_status).filter((k) => !kinds.has(k));
  const docsDone = !!o.docs_submitted_at && missingDocs.length === 0;
  const steps: Step[] = [
    { key: "details", label: "Contact details & emergency contact", done: !!person?.profile_completed_at, href: "/portal/details" },
    { key: "personal", label: "Employee Personal Information form", done: !!o.personal_submitted_at, href: "/portal/onboarding/personal" },
    { key: "w4", label: "Form W-4 (federal tax withholding)", done: !!o.w4_submitted_at, href: "/portal/onboarding/w4" },
    { key: "deposit", label: "Direct Deposit Agreement", done: !!o.deposit_submitted_at, href: "/portal/onboarding/deposit" },
    {
      key: "documents", label: "Upload documents (SSN, driver's license, void check, certificates…)", done: docsDone, href: "/portal/onboarding/documents",
      detail: missingDocs.length ? `${missingDocs.length} still needed` : undefined,
    },
    ...(sigs ?? []).map((s) => ({ key: `sign:${s.id}`, label: `Sign: ${s.title}`, done: s.status === "signed", href: `/portal/onboarding/sign/${s.id}` })),
    ...(i9 ? [{ key: "i9", label: "Form I-9 (Section 1)", done: i9.status !== "invited", href: "/portal/i9" }] : []),
  ];
  return { ob: o, steps, done: steps.filter((s) => s.done).length, total: steps.length, complete: steps.every((s) => s.done) };
}

/** Marks onboarding complete (once) and tells HR. Call after any step is saved. */
export async function checkComplete(personId: string) {
  const s = await onboardingSteps(personId);
  if (!s || !s.complete || s.ob.completed_at) return s;
  await db().from("stagity_onboarding").update({ completed_at: new Date().toISOString(), returned_note: null, returned_items: null }).eq("person_id", personId);
  const { data: p } = await db().from("stagity_people").select("first_name, last_name").eq("id", personId).single();
  await audit(null, `person:${personId}`, "onboarding_completed");
  await send(company.email, `${p?.first_name} ${p?.last_name} finished onboarding`, [
    `${p?.first_name} ${p?.last_name} has completed every onboarding step (W-4, direct deposit, documents and signatures).`,
    "Review their details and add them to ADP RUN.",
  ], { label: "Open onboarding", href: `${siteOrigin()}/hr/onboarding/${personId}` }, { signature: "Stagity Solutions Portal" });
  return s;
}

/** Copies the chosen company documents onto a person's list to sign. */
export async function requestSignatures(personId: string, templateIds: string[], hr: string) {
  if (!templateIds.length) return;
  const [{ data: templates }, { data: existing }] = await Promise.all([
    db().from("stagity_doc_templates").select("id, title, storage_path").in("id", templateIds).eq("active", true),
    db().from("stagity_signatures").select("template_id").eq("person_id", personId).neq("status", "cancelled"),
  ]);
  const have = new Set((existing ?? []).map((e) => e.template_id));
  const rows = (templates ?? []).filter((t) => !have.has(t.id)).map((t) => ({ person_id: personId, template_id: t.id, title: t.title, source_path: t.storage_path, requested_by: hr }));
  if (rows.length) await db().from("stagity_signatures").insert(rows);
}

export function sendOnboardingInvite(to: string, firstName: string, due: string | null) {
  const dueText = due ? new Date(`${due}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }) : null;
  return send(to, "Please complete your onboarding with Stagity Solutions", [
    `Hi ${firstName},`,
    "Welcome to Stagity Solutions LLC!",
    `Please complete your new-hire paperwork in the Stagity Solutions employee portal${dueText ? ` by ${dueText}` : ""}. You fill in the forms online and we create the signed W-4 and Direct Deposit forms for you; no printing or scanning.`,
    "## Step 1: Forms",
    "• Employee Personal Information form\n• Form W-4\n• Direct Deposit Agreement\n• Company documents to sign (e.g. your offer letter)\n• Form I-9: we'll send you a separate link",
    "## Step 2: Documents to upload (photo or PDF)",
    "• Social Security card, driver's license and a voided check\n• I-94, passport, and your visa or EAD card (if you're not a U.S. citizen)\n• 10th, Inter, Bachelor's and Master's certificates",
    "Everything is stored securely and only HR can see it.",
    `Questions? Reply to this email or call ${company.phone}.`,
  ], { label: "Start onboarding", href: `${siteOrigin()}/portal/onboarding` });
}

export function sendOnboardingReminder(to: string, firstName: string, due: string, left: string[]) {
  const dueText = new Date(`${due}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  return send(to, "Reminder: please finish your onboarding", [
    `Hi ${firstName},`,
    `Your onboarding isn't finished yet. Please complete it by ${dueText}. Still to do:`,
    left.map((l) => `• ${l}`).join("\n"),
    `Questions? Reply to this email or call ${company.phone}.`,
  ], { label: "Continue onboarding", href: `${siteOrigin()}/portal/onboarding` });
}

/** The one email a new hire gets: welcome, what to do, and their portal login. */
export function sendNewHireEmail(to: string, firstName: string, tempPassword: string, due: string | null, hasOffer: boolean) {
  const dueText = due ? new Date(`${due}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }) : null;
  return send(to, "Welcome to Stagity Solutions LLC: your onboarding and portal login", [
    `Hi ${firstName},`,
    "Welcome to Stagity Solutions LLC! We're excited to have you on the team.",
    `Please complete your new-hire paperwork in our employee portal${dueText ? ` by ${dueText}` : " as soon as possible"}. Everything is online: fill in the forms, upload photos of your documents and sign. No printing or scanning.`,
    "## Your login",
    `Portal: ${siteOrigin()}/portal/login\nEmail: ${to}\nTemporary password: ${tempPassword}\nThe temporary password expires in 7 days. You'll choose your own password when you first sign in.`,
    "## Step 1: Forms (in the portal)",
    `• Employee Personal Information form\n• Form W-4\n• Direct Deposit Agreement${hasOffer ? "\n• Your Employment Offer Letter: review and sign" : ""}\n• Any company documents listed for you to sign`,
    "## Step 2: Documents to upload (a clear phone photo or PDF)",
    "• Social Security card, driver's license and a voided check\n• I-94, passport, and your visa or EAD card (if you're not a U.S. citizen)\n• 10th, Inter, Bachelor's and Master's certificates",
    "## Step 3: Form I-9",
    "Once your documents are uploaded, we'll email you a link to complete Form I-9 Section 1. Then HR will verify your documents and complete E-Verify.",
    `Questions? Reply to this email or call ${company.phone}.`,
  ], { label: "Sign in and start", href: `${siteOrigin()}/portal/login` });
}
