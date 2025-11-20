import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getOAuth2Client } from "../utils";

export async function GET(request: NextRequest) {
  try {
    const oauth2Client = await getOAuth2Client();

    if (!oauth2Client) {
      return NextResponse.json({
        success: false,
        connected: false,
        message: "Not connected to Google",
      });
    }

    // Test connection by getting user info
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    return NextResponse.json({
      success: true,
      connected: true,
      email: userInfo.data.email,
      name: userInfo.data.name,
    });
  } catch (error: any) {
    console.error("Google status check error:", error.message || error);
    return NextResponse.json({
      success: false,
      connected: false,
      error: error.message || "Failed to check Google connection status",
    });
  }
}

