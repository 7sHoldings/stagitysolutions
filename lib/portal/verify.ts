import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/i9/server";
import { TS_BUCKET } from "./server";
import { datesBetween, periodFor } from "./dates";

/*
 * Automatic check of a consultant's uploaded client-approved timesheet (screenshot or PDF).
 * Claude reads the file(s) and reports whether they show the client's approval, whose name and
 * which dates they cover, and the hours per day, which we compare with what the consultant entered.
 *
 * Needs ANTHROPIC_API_KEY (Vercel → Settings → Environment Variables). Without it, timesheets are
 * marked "unchecked" and HR reviews them by eye as before.
 */

export type AiVerdict = "verified" | "needs_review" | "not_approved" | "unchecked";

export type AiCheck = {
  is_timesheet: boolean;
  approval_status: "approved" | "pending" | "rejected" | "not_shown" | "unclear";
  approval_evidence: string;
  name_on_document: string;
  name_matches: "yes" | "no" | "not_shown";
  dates_on_document: string;
  period_matches: "yes" | "partial" | "no" | "not_shown";
  hours_by_date: { date: string; hours: number }[];
  total_hours_on_document: number;
  total_hours_shown: boolean;
  summary: string;
  issues: string[];
};

export type AiResult = {
  verdict: AiVerdict;
  check: AiCheck | null;
  mismatches: { date: string; entered: number; document: number }[];
  error?: string;
  model?: string;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_timesheet", "approval_status", "approval_evidence", "name_on_document", "name_matches", "dates_on_document",
    "period_matches", "hours_by_date", "total_hours_on_document", "total_hours_shown", "summary", "issues",
  ],
  properties: {
    is_timesheet: { type: "boolean", description: "True if the files show a timesheet / time report from a client or vendor system." },
    approval_status: {
      type: "string",
      enum: ["approved", "pending", "rejected", "not_shown", "unclear"],
      description: "Approval state shown on the document. 'approved' only if the document clearly shows approval (e.g. status Approved, approver name/date, approval email).",
    },
    approval_evidence: { type: "string", description: "Quote or describe exactly what on the document shows the approval state. Empty string if nothing." },
    name_on_document: { type: "string", description: "Worker/employee name shown on the document, or empty string." },
    name_matches: { type: "string", enum: ["yes", "no", "not_shown"] },
    dates_on_document: { type: "string", description: "Date range the document covers, as written." },
    period_matches: { type: "string", enum: ["yes", "partial", "no", "not_shown"], description: "Whether the document covers the expected dates." },
    hours_by_date: {
      type: "array",
      description: "Hours per calendar date as shown on the document, only for dates you can read. Dates as YYYY-MM-DD.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "hours"],
        properties: { date: { type: "string" }, hours: { type: "number" } },
      },
    },
    total_hours_on_document: { type: "number", description: "Total hours shown on the document for the expected dates (0 if not shown)." },
    total_hours_shown: { type: "boolean" },
    summary: { type: "string", description: "One short sentence for HR describing what the document shows." },
    issues: { type: "array", items: { type: "string" }, description: "Anything HR should look at. Empty if none." },
  },
} as const;

type Block = Anthropic.Beta.BetaContentBlockParam;

async function fileBlocks(timesheetId: string): Promise<{ blocks: Block[]; skipped: string[] }> {
  const { data: files } = await db().from("stagity_timesheet_files").select("storage_path, mime_type, original_name").eq("timesheet_id", timesheetId).order("uploaded_at");
  const blocks: Block[] = [];
  const skipped: string[] = [];
  for (const f of files ?? []) {
    const { data: blob } = await db().storage.from(TS_BUCKET).download(f.storage_path);
    if (!blob) continue;
    const bytes = Buffer.from(await blob.arrayBuffer());
    const mime = f.mime_type ?? blob.type;
    if (mime === "application/pdf" && bytes.length <= 30 * 1024 * 1024) {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } });
    } else if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime) && bytes.length <= 5 * 1024 * 1024) {
      blocks.push({ type: "image", source: { type: "base64", media_type: mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: bytes.toString("base64") } });
    } else {
      skipped.push(f.original_name ?? "file");
    }
  }
  return { blocks, skipped };
}

/** Checks a timesheet's uploads against the hours entered. Never throws. */
export async function verifyTimesheet(timesheetId: string): Promise<AiResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { verdict: "unchecked", check: null, mismatches: [], error: "Automatic check isn't set up (no ANTHROPIC_API_KEY)." };

  const { data: sheet } = await db()
    .from("stagity_timesheets")
    .select("id, week_start, stagity_people(first_name, last_name, client_name)")
    .eq("id", timesheetId)
    .single();
  if (!sheet) return { verdict: "unchecked", check: null, mismatches: [], error: "Timesheet not found." };
  const person = sheet.stagity_people as unknown as { first_name: string; last_name: string; client_name: string | null };
  const period = periodFor(sheet.week_start);
  const { data: days } = await db().from("stagity_timesheet_days").select("work_date, hours").eq("timesheet_id", timesheetId);
  const entered = new Map((days ?? []).map((d) => [d.work_date as string, Number(d.hours)]));
  const enteredLines = datesBetween(period.start, period.end).map((d) => `${d}: ${entered.has(d) ? entered.get(d) : "(blank)"}`).join("\n");

  const { blocks, skipped } = await fileBlocks(timesheetId);
  if (!blocks.length) {
    return { verdict: "needs_review", check: null, mismatches: [], error: skipped.length ? `Couldn't read ${skipped.join(", ")} automatically (use a PDF, JPG or PNG under 5 MB).` : "No file uploaded." };
  }

  const prompt = `You are checking a consultant's timesheet for a staffing company's HR team.

The attached file(s) were uploaded by the consultant as proof that their client approved their hours. Read them carefully and report what they actually show. Do not assume anything that isn't visible. If something can't be read, say so rather than guessing.

Consultant: ${person.first_name} ${person.last_name}
Expected dates: ${period.start} to ${period.end}
Hours the consultant entered on our portal:
${enteredLines}

Report:
- whether this is a timesheet/time report at all,
- the approval state shown (only "approved" if the document clearly shows it was approved, e.g. an "Approved" status, an approver name and date, or an approval email; "pending"/"submitted"/"saved" is not approved),
- the worker name and the dates the document covers,
- the hours per date you can read for the expected dates.`;

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: [...blocks, { type: "text", text: prompt }] }],
    });
    if (response.stop_reason === "refusal") {
      return { verdict: "needs_review", check: null, mismatches: [], error: "The automatic check declined to read this file.", model: response.model };
    }
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
    if (!text) return { verdict: "needs_review", check: null, mismatches: [], error: "The automatic check returned no result." };
    const check = JSON.parse(text) as AiCheck;
    if (skipped.length) check.issues.push(`Not checked automatically: ${skipped.join(", ")}.`);

    // Compare hours per date with what was entered.
    const mismatches: AiResult["mismatches"] = [];
    for (const { date, hours } of check.hours_by_date) {
      if (date < period.start || date > period.end) continue;
      const mine = entered.get(date) ?? 0;
      if (Math.abs(mine - Number(hours)) > 0.01) mismatches.push({ date, entered: mine, document: Number(hours) });
    }
    const enteredTotal = [...entered.values()].reduce((a, b) => a + b, 0);
    const totalOff = check.total_hours_shown && Math.abs(enteredTotal - check.total_hours_on_document) > 0.01;

    let verdict: AiVerdict;
    if (!check.is_timesheet || ["pending", "rejected"].includes(check.approval_status)) verdict = "not_approved";
    else if (
      check.approval_status === "approved" &&
      check.name_matches !== "no" &&
      ["yes", "partial"].includes(check.period_matches) &&
      !mismatches.length &&
      !totalOff &&
      (check.hours_by_date.length > 0 || check.total_hours_shown)
    ) verdict = "verified";
    else verdict = "needs_review";
    return { verdict, check, mismatches, model: response.model };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { verdict: "unchecked", check: null, mismatches: [], error: "The automatic check is busy; HR will review it." };
    if (e instanceof Anthropic.APIError) return { verdict: "unchecked", check: null, mismatches: [], error: `Automatic check failed (${e.status ?? "network"}).` };
    console.error("verifyTimesheet:", e);
    return { verdict: "unchecked", check: null, mismatches: [], error: "Automatic check failed." };
  }
}

/** Runs the check and saves the result on the timesheet. */
export async function verifyAndStore(timesheetId: string): Promise<AiResult> {
  const r = await verifyTimesheet(timesheetId);
  await db()
    .from("stagity_timesheets")
    .update({ ai_status: r.verdict, ai_check: { ...r }, ai_checked_at: new Date().toISOString() })
    .eq("id", timesheetId);
  return r;
}

/** Plain-language explanation for the consultant. */
export function explainForConsultant(r: AiResult): string {
  if (r.verdict === "verified") return "Your approved timesheet was checked and matches your hours.";
  const c = r.check;
  if (!c) return r.error ?? "We couldn't check your upload automatically.";
  if (!c.is_timesheet) return "The uploaded file doesn't look like a timesheet. Please upload a screenshot or PDF of the timesheet from your client or vendor portal.";
  if (c.approval_status === "pending") return "The uploaded timesheet doesn't show it as approved yet (it looks pending/submitted). Upload it once your client has approved it.";
  if (c.approval_status === "rejected") return "The uploaded timesheet shows as rejected by the client. Please fix it with your client and upload the approved version.";
  if (r.mismatches.length) {
    return `The hours you entered don't match the uploaded timesheet: ${r.mismatches.map((m) => `${m.date} you entered ${m.entered}, the timesheet shows ${m.document}`).join("; ")}.`;
  }
  if (c.approval_status !== "approved") return "We couldn't see an approval on the uploaded timesheet. Make sure the screenshot shows the Approved status or approver.";
  return c.summary;
}
