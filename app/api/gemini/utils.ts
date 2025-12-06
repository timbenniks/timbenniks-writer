/**
 * Get Gemini API configuration from environment variables
 */
export function getGeminiConfig(): { apiKey: string } | null {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return null;
  }

  return { apiKey };
}

/**
 * Build image generation prompt with article context
 */
export function buildImagePrompt(
  userPrompt: string,
  articleContext?: string
): string {
  let prompt = userPrompt;

  if (articleContext) {
    prompt = `Create a professional, visually striking cover image for a tech article.

Article context:
${articleContext.substring(0, 1500)}

User's creative direction:
${userPrompt}

Style guidelines:
- Modern, clean aesthetic suitable for a tech blog
- Professional quality suitable for a website header
- Avoid text overlays or watermarks
- Rich colors and good contrast
- 16:9 aspect ratio composition`;
  }

  return prompt;
}
