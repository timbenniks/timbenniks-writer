import { google } from "googleapis";
import { cookies } from "next/headers";
import type { OAuth2Client } from "google-auth-library";

// Constants
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const COOKIE_NAMES = {
  ACCESS_TOKEN: "google_access_token",
  REFRESH_TOKEN: "google_refresh_token",
  TOKEN_EXPIRY: "google_token_expiry",
} as const;

const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes

/**
 * Get Google OAuth configuration from environment variables
 */
export function getGoogleConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * Create a new OAuth2 client (without tokens)
 */
export function createOAuth2Client(): OAuth2Client {
  const config = getGoogleConfig();
  if (!config) {
    throw new Error("Google OAuth not configured");
  }

  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );
}

/**
 * Get cookie options for Google tokens
 */
function getCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}

/**
 * Set Google tokens in cookies
 */
export async function setGoogleTokens(tokens: {
  access_token: string;
  refresh_token: string;
  expiry_date?: number | null;
}) {
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAMES.ACCESS_TOKEN, tokens.access_token, {
    ...getCookieOptions(60 * 60), // 1 hour
  });

  cookieStore.set(COOKIE_NAMES.REFRESH_TOKEN, tokens.refresh_token, {
    ...getCookieOptions(60 * 60 * 24 * 30), // 30 days
  });

  if (tokens.expiry_date) {
    cookieStore.set(
      COOKIE_NAMES.TOKEN_EXPIRY,
      tokens.expiry_date.toString(),
      {
        ...getCookieOptions(60 * 60 * 24 * 30), // 30 days
      }
    );
  }
}

/**
 * Get Google tokens from cookies
 */
export async function getGoogleTokens(): Promise<{
  accessToken: string;
  refreshToken: string;
  expiryDate: string | null;
} | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(COOKIE_NAMES.ACCESS_TOKEN)?.value;
  const refreshToken = cookieStore.get(COOKIE_NAMES.REFRESH_TOKEN)?.value;
  const expiryDate = cookieStore.get(COOKIE_NAMES.TOKEN_EXPIRY)?.value || null;

  if (!accessToken || !refreshToken) {
    return null;
  }

  return { accessToken, refreshToken, expiryDate };
}

/**
 * Delete all Google tokens from cookies
 */
export async function deleteGoogleTokens() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAMES.ACCESS_TOKEN);
  cookieStore.delete(COOKIE_NAMES.REFRESH_TOKEN);
  cookieStore.delete(COOKIE_NAMES.TOKEN_EXPIRY);
}

/**
 * Get a valid OAuth2 client with refreshed tokens if needed
 */
export async function getOAuth2Client(): Promise<OAuth2Client | null> {
  const config = getGoogleConfig();
  if (!config) {
    throw new Error("Google OAuth not configured");
  }

  const tokens = await getGoogleTokens();
  if (!tokens) {
    return null;
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiryDate ? parseInt(tokens.expiryDate, 10) : undefined,
  });

  // Refresh token if expired or about to expire
  const now = Date.now();
  const expiry = tokens.expiryDate ? parseInt(tokens.expiryDate, 10) : 0;

  if (!expiry || expiry - now < TOKEN_REFRESH_THRESHOLD) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        return null;
      }

      oauth2Client.setCredentials(credentials);
      await setGoogleTokens({
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token || tokens.refreshToken,
        expiry_date: credentials.expiry_date || undefined,
      });
    } catch (error: any) {
      console.error("Failed to refresh Google token:", error.message || error);
      return null;
    }
  }

  return oauth2Client;
}

