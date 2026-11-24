import { cookies } from "next/headers";
import { requireHr } from "@/lib/i9/server";
import { oauthAvailable } from "@/lib/gdrive";
import { googleRedirectUri, makeState } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

/** Starts "Connect Google Drive": sends HR to Google to sign in and allow access to files the portal creates. */
export async function GET() {
  await requireHr();
  if (!oauthAvailable()) return new Response("Google sign-in isn't set up yet (GOOGLE_OAUTH_CLIENT_ID / SECRET missing in Vercel).", { status: 400 });
  const state = makeState();
  (await cookies()).set("gdrive_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/google", maxAge: 600 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return Response.redirect(url.toString(), 302);
}
