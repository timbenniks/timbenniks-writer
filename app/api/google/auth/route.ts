import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client, GOOGLE_SCOPES } from "../utils";

export async function GET(request: NextRequest) {
  try {
    const oauth2Client = createOAuth2Client();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: GOOGLE_SCOPES,
      prompt: "consent", // Force consent to get refresh token
    });

    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    console.error("Google OAuth initiation error:", error);
    return NextResponse.redirect(
      new URL("/settings?google_error=not_configured", request.url)
    );
  }
}

