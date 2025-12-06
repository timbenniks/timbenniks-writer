import { NextResponse } from "next/server";

export async function GET() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;

  // Only return public config (not the secret)
  return NextResponse.json({
    success: true,
    configured: !!(cloudName && apiKey),
    cloudName: cloudName || null,
    apiKey: apiKey || null,
  });
}

