import "server-only";
import nodemailer from "nodemailer";
import { company } from "@/lib/content";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Mailboxes the site sends from.
 *   hr          — logins, I-9, welcome emails (SMTP_USER / SMTP_PASS)
 *   timesheets  — timesheet reminders and approval/rejection emails to consultants
 *   accounts    — vendor invoices
 * Each mailbox can have its own Google App Password (TIMESHEETS_SMTP_PASS, ACCOUNTS_SMTP_PASS).
 * If it doesn't, the email is sent through the HR account with that address as the sender, which works
 * when the address is set up under "Send mail as" in the HR Gmail settings (or is an alias of it).
 */
export type Mailbox = "hr" | "timesheets" | "accounts";

export function mailboxAddress(box: Mailbox): string {
  if (box === "timesheets") return company.timesheetsEmail;
  if (box === "accounts") return company.accountsEmail;
  return process.env.SMTP_USER || company.email;
}

const mailboxName: Record<Mailbox, string> = {
  hr: "Stagity Solutions HR",
  timesheets: "Stagity Solutions Timesheets",
  accounts: "Stagity Solutions Accounts",
};

function transport(box: Mailbox) {
  const own = box === "timesheets" ? process.env.TIMESHEETS_SMTP_PASS : box === "accounts" ? process.env.ACCOUNTS_SMTP_PASS : undefined;
  const user = own ? mailboxAddress(box) : process.env.SMTP_USER;
  const pass = (own ?? process.env.SMTP_PASS)?.replace(/\s+/g, "");
  if (!user || !pass) return null;
  return nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
}

/** Returns false if email isn't configured or sending failed. */
export type MailExtras = {
  cc?: string[];
  bcc?: string[];
  attachments?: { filename: string; content: Buffer | Uint8Array; contentType?: string }[];
  signature?: string;
  from?: Mailbox;
  replyTo?: string;
};

export async function send(
  to: string,
  subject: string,
  paragraphs: string[],
  button?: { label: string; href: string },
  extras: MailExtras = {},
) {
  const box = extras.from ?? "hr";
  const tr = transport(box);
  if (!tr) {
    console.warn("Mail skipped: SMTP settings not set.");
    return false;
  }
  const signature = extras.signature ?? mailboxName[box];
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#0b1220;max-width:560px">
    ${paragraphs
      .map((p) =>
        // "## Title" = a small heading; line breaks inside a paragraph are kept (for bullet lists).
        p.startsWith("## ")
          ? `<p style="margin:22px 0 8px;font-weight:bold;font-size:16px;color:#0b1220">${esc(p.slice(3))}</p>`
          : `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`,
      )
      .join("")}
    ${
      button
        ? `<p style="margin:22px 0"><a href="${esc(button.href)}" style="background:#1259d6;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">${esc(button.label)}</a></p>
           <p style="margin:0 0 14px;color:#5b6577;font-size:13px">Or paste this link into your browser: ${esc(button.href)}</p>`
        : ""
    }
    <p style="margin-top:22px;color:#5b6577;font-size:13px">${esc(signature)}</p></div>`;
  const text = paragraphs.map((p) => (p.startsWith("## ") ? p.slice(3).toUpperCase() : p)).join("\n\n") + (button ? `\n\n${button.label}: ${button.href}\n` : "");
  try {
    await tr.sendMail({
      from: `"${mailboxName[box]}" <${mailboxAddress(box)}>`,
      replyTo: extras.replyTo,
      to,
      cc: extras.cc?.length ? extras.cc : undefined,
      bcc: extras.bcc?.length ? extras.bcc : undefined,
      subject,
      text,
      html,
      attachments: extras.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType })),
    });
    return true;
  } catch (e) {
    console.error("Mail failed:", e);
    return false;
  }
}

export function sendLoginCode(to: string, code: string) {
  return send(to, `Your Stagity HR sign-in code: ${code}`, [
    `Your sign-in code is ${code}.`,
    "It expires in 10 minutes. If you didn't try to sign in, you can ignore this email.",
  ]);
}

export function sendPasswordResetCode(to: string, firstName: string, code: string) {
  return send(to, `Your Stagity portal password reset code: ${code}`, [
    `Hi ${firstName},`,
    `Your code to reset your portal password is ${code}.`,
    "It expires in 15 minutes. If you didn't ask to reset your password, you can ignore this email; your password hasn't changed.",
  ]);
}

/** Daily nudge until the person signs in and sets their own password. */
export function sendSignupReminder(to: string, firstName: string, link: string, due: string, tempValid: boolean) {
  const dueText = new Date(`${due}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  return send(
    to,
    "Reminder: please set up your Stagity Solutions portal account",
    [
      `Hi ${firstName},`,
      `You haven't set up your Stagity Solutions employee portal account yet. Please do it by ${dueText}. It takes 2 minutes.`,
      tempValid
        ? `Sign in with your email (${to}) and the temporary password from the email titled "Your Stagity Solutions portal account", then choose your own password.`
        : `Your temporary password has expired. On the sign-in page, click "Forgot your password?" and we'll email you a code to set your password.`,
      ...(tempValid ? ['Can\'t find that email? On the sign-in page, click "Forgot your password?" and we\'ll email you a code instead.'] : []),
      `You'll use the portal to submit your weekly timesheets. Questions? Reply to this email or call ${company.phone}.`,
    ],
    { label: "Set up my account", href: link },
  );
}

export function sendWelcome(to: string, firstName: string, tempPassword: string, link: string, tasks: string[]) {
  return send(
    to,
    "Your Stagity Solutions portal account",
    [
      `Hi ${firstName},`,
      "Stagity Solutions HR has created your account on our employee portal.",
      ...(tasks.length ? [`Once you sign in, please: ${tasks.join("; ")}.`] : []),
      `Sign in with your email address (${to}) and this temporary password: ${tempPassword}`,
      "The temporary password expires in 7 days. You'll be asked to choose your own password the first time you sign in.",
    ],
    { label: "Sign in to the portal", href: link },
  );
}

export function sendI9Task(to: string, firstName: string, link: string, firstDay: string | null) {
  return send(
    to,
    "Complete your Form I-9 for Stagity Solutions",
    [
      `Hi ${firstName},`,
      "Federal law requires every new employee to complete Form I-9 (Employment Eligibility Verification).",
      `Please sign in to the portal, complete Section 1 and upload photos of your documents${
        firstDay ? ` no later than your first day of work (${firstDay})` : " before your first day of work"
      }. It takes about 10 minutes.`,
      "After that, HR will schedule a short live video call where you show the same original documents on camera.",
    ],
    { label: "Open the portal", href: link },
  );
}

export function sendHrSection1Done(to: string, employee: string, link: string) {
  return send(to, `I-9 Section 1 completed: ${employee}`, [
    `${employee} completed Section 1 of Form I-9 and uploaded their documents.`,
    "Next: review the document copies, hold the live video call, and complete Section 2 within 3 business days of their first day of work.",
  ], { label: "Open in HR portal", href: link });
}
