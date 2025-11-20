import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client, setGoogleTokens } from "../utils";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?google_error=${encodeURIComponent(error)}`, request.url)
    );
  }

  // Validate authorization code
  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?google_error=no_code", request.url)
    );
  }

  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/settings?google_error=no_tokens", request.url)
      );
    }

    await setGoogleTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date || null,
    });

    const origin = request.nextUrl.origin;
    return NextResponse.redirect(`${origin}/settings?google_connected=true`);
  } catch (error: any) {
    console.error("Google OAuth callback error:", error);
    return NextResponse.redirect(
      new URL(
        `/settings?google_error=${encodeURIComponent(error.message || "callback_failed")}`,
        request.url
      )
    );
  }
}

