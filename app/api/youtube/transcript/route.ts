import { NextRequest, NextResponse } from "next/server";
import { Innertube } from "youtubei.js";

let innertube: Innertube | null = null;

async function getInnertube(): Promise<Innertube> {
  if (!innertube) {
    innertube = await Innertube.create({
      lang: "en",
      location: "US",
      retrieve_player: false,
    });
  }
  return innertube;
}

/**
 * Fetch transcript using youtubei.js
 */
async function fetchTranscript(videoId: string): Promise<string> {
  console.log("Fetching transcript for:", videoId);

  const yt = await getInnertube();
  const info = await yt.getInfo(videoId);

  console.log("Got video info, fetching transcript...");

  // Get transcript
  const transcriptInfo = await info.getTranscript();

  if (!transcriptInfo) {
    throw new Error("No transcript available for this video");
  }

  // Get the transcript content
  const transcriptContent = transcriptInfo.transcript?.content;
  if (!transcriptContent) {
    throw new Error("Transcript content is empty");
  }

  // Extract text from transcript segments
  // Use any to handle varying API response structures
  const body = transcriptContent.body as any;
  const segments =
    body?.initial_segments ||
    body?.segments ||
    [];

  if (segments.length === 0) {
    throw new Error("No transcript segments found");
  }

  console.log("Found", segments.length, "transcript segments");

  // Extract text from each segment
  const texts: string[] = [];
  for (const segment of segments) {
    // Handle different segment structures
    const text =
      segment.snippet?.text ||
      segment.snippet?.runs?.map((r: any) => r.text).join("") ||
      "";
    if (text.trim()) {
      texts.push(text.trim());
    }
  }

  if (texts.length === 0) {
    throw new Error("Could not extract text from transcript");
  }

  return texts.join(" ").replace(/\s+/g, " ").trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoId } = body;

    if (!videoId) {
      return NextResponse.json(
        { success: false, error: "Missing required field: videoId" },
        { status: 400 }
      );
    }

    try {
      const transcript = await fetchTranscript(videoId);

      return NextResponse.json({
        success: true,
        transcript,
        videoId,
      });
    } catch (transcriptError: any) {
      console.log("Transcript error:", transcriptError.message);
      return NextResponse.json({
        success: true,
        transcript: "",
        videoId,
        warning: transcriptError.message || "Transcript not available",
      });
    }
  } catch (error: any) {
    console.error("YouTube transcript error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch transcript",
      },
      { status: 500 }
    );
  }
}
