import "server-only";
import nodemailer from "nodemailer";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function transport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");
  if (!user || !pass) return null;
  return {
    user,
    t: nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } }),
  };
}

/** Returns false if email isn't configured or sending failed. */
async function send(to: string, subject: string, paragraphs: string[], button?: { label: string; href: string }) {
  const tr = transport();
  if (!tr) {
    console.warn("I-9 mail skipped: SMTP_USER / SMTP_PASS not set.");
    return false;
  }
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#0b1220;max-width:560px">
    ${paragraphs.map((p) => `<p style="margin:0 0 14px">${esc(p)}</p>`).join("")}
    ${
      button
        ? `<p style="margin:22px 0"><a href="${esc(button.href)}" style="background:#1259d6;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">${esc(button.label)}</a></p>
           <p style="margin:0 0 14px;color:#5b6577;font-size:13px">Or paste this link into your browser: ${esc(button.href)}</p>`
        : ""
    }
    <p style="margin-top:22px;color:#5b6577;font-size:13px">Stagity Solutions HR</p></div>`;
  const text = paragraphs.join("\n\n") + (button ? `\n\n${button.label}: ${button.href}\n` : "");
  try {
    await tr.t.sendMail({ from: `"Stagity Solutions HR" <${tr.user}>`, to, subject, text, html });
    return true;
  } catch (e) {
    console.error("I-9 mail failed:", e);
    return false;
  }
}

export function sendLoginCode(to: string, code: string) {
  return send(to, `Your Stagity HR sign-in code: ${code}`, [
    `Your sign-in code is ${code}.`,
    "It expires in 10 minutes. If you didn't try to sign in, you can ignore this email.",
  ]);
}

export function sendEmployeeInvite(to: string, firstName: string, link: string, firstDay: string | null) {
  return send(
    to,
    "Complete your Form I-9 for Stagity Solutions",
    [
      `Hi ${firstName},`,
      "Welcome to Stagity Solutions! Federal law requires every new employee to complete Form I-9 (Employment Eligibility Verification).",
      `Please complete Section 1 and upload photos of your identity and work authorization documents${
        firstDay ? ` no later than your first day of work (${firstDay})` : " before your first day of work"
      }. It takes about 10 minutes.`,
      "After that, HR will schedule a short live video call where you show the same original documents on camera. Please keep them handy.",
      "This link is private to you. Don't forward it.",
    ],
    { label: "Start Form I-9", href: link },
  );
}

export function sendHrSection1Done(to: string, employee: string, link: string) {
  return send(to, `I-9 Section 1 completed: ${employee}`, [
    `${employee} completed Section 1 of Form I-9 and uploaded their documents.`,
    "Next: review the document copies, hold the live video call, and complete Section 2 within 3 business days of their first day of work.",
  ], { label: "Open in HR portal", href: link });
}
