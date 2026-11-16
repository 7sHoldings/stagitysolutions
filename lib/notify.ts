import "server-only";
import nodemailer from "nodemailer";

type Lead = {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  interest?: string;
  message: string;
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Emails a new website enquiry to the team using the company's Google Workspace account.
 * Needs SMTP_USER (e.g. hr@stagitysolutions.com) and SMTP_PASS (a Google App Password).
 * NOTIFY_TO is optional (defaults to SMTP_USER). If not configured, it silently does nothing.
 */
export async function notifyNewLead(lead: Lead) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");
  if (!user || !pass) {
    console.warn("notifyNewLead: SMTP_USER / SMTP_PASS not set — email alert skipped.");
    return;
  }
  const to = process.env.NOTIFY_TO || user;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  const rows: [string, string | undefined][] = [
    ["Name", lead.name],
    ["Email", lead.email],
    ["Company", lead.company],
    ["Phone", lead.phone],
    ["Interested in", lead.interest],
  ];
  const text =
    rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\nMessage:\n${lead.message}\n`;
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#0b1220">
      <h2 style="margin:0 0 12px">New website enquiry</h2>
      <table cellpadding="6" style="border-collapse:collapse">
        ${rows
          .filter(([, v]) => v)
          .map(([k, v]) => `<tr><td style="color:#5b6577">${k}</td><td><strong>${esc(v!)}</strong></td></tr>`)
          .join("")}
      </table>
      <p style="margin:16px 0 6px;color:#5b6577">Message</p>
      <div style="white-space:pre-wrap;border-left:3px solid #1259d6;padding:8px 12px;background:#f5f6f8">${esc(lead.message)}</div>
      <p style="margin-top:18px;color:#5b6577;font-size:13px">Reply to this email to answer ${esc(lead.name)} directly.</p>
    </div>`;

  await transporter.sendMail({
    from: `"Stagity Website" <${user}>`,
    to,
    replyTo: `"${lead.name.replace(/"/g, "")}" <${lead.email}>`,
    subject: `New enquiry: ${lead.name}${lead.interest ? ` — ${lead.interest}` : ""}`,
    text,
    html,
  });
}
