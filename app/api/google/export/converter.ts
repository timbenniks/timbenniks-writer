import type { Paragraph, TextRun } from "./types";

/**
 * Convert paragraphs to Google Docs API requests
 */
export async function paragraphsToGoogleDocsRequests(
  paragraphs: Paragraph[],
  title: string,
  startIndex: number = 1
): Promise<any[]> {
  const requests: any[] = [];
  let currentIndex = startIndex;

  // Insert title with single newline (spacing will be handled by spaceBelow)
  requests.push({
    insertText: {
      location: { index: currentIndex },
      text: title + "\n",
    },
  });

  // Style title as heading 1 with spacing
  const titleEndIndex = currentIndex + title.length + 1;
  requests.push({
    updateParagraphStyle: {
      range: {
        startIndex: currentIndex,
        endIndex: titleEndIndex,
      },
      paragraphStyle: {
        namedStyleType: "HEADING_1",
        spaceBelow: {
          magnitude: 12,
          unit: "PT",
        },
      },
      fields: "namedStyleType,spaceBelow",
    },
  });

  currentIndex = titleEndIndex;

  // Process each paragraph
  for (const para of paragraphs) {
    if (para.imageUrl) {
      currentIndex = insertImagePlaceholder(para, currentIndex, requests);
    } else if (para.isCodeBlock) {
      currentIndex = insertCodeBlock(para, currentIndex, requests);
    } else {
      currentIndex = insertParagraph(para, currentIndex, requests);
    }
  }

  return requests;
}

/**
 * Insert image placeholder as formatted link
 */
function insertImagePlaceholder(
  para: Paragraph,
  currentIndex: number,
  requests: any[]
): number {
  const imageText = para.textRuns.length > 0 ? para.textRuns[0].text : "Image";
  const imageLinkText = `[${imageText}](${para.imageUrl})`;

  requests.push({
    insertText: {
      location: { index: currentIndex },
      text: imageLinkText + "\n",
    },
  });

  // Make the URL part a clickable link
  const linkStartIndex = currentIndex + imageLinkText.indexOf(para.imageUrl!);
  const linkEndIndex = linkStartIndex + para.imageUrl!.length;

  requests.push({
    updateTextStyle: {
      range: {
        startIndex: linkStartIndex,
        endIndex: linkEndIndex,
      },
      textStyle: {
        link: {
          url: para.imageUrl,
        },
      },
      fields: "link",
    },
  });

  // Style the image placeholder text (italic, slightly smaller)
  requests.push({
    updateTextStyle: {
      range: {
        startIndex: currentIndex,
        endIndex: currentIndex + imageLinkText.length,
      },
      textStyle: {
        italic: true,
        fontSize: {
          magnitude: 10,
          unit: "PT",
        },
      },
      fields: "italic,fontSize",
    },
  });

  return currentIndex + imageLinkText.length + 1;
}

/**
 * Insert code block with formatting
 */
function insertCodeBlock(
  para: Paragraph,
  currentIndex: number,
  requests: any[]
): number {
  const codeText = para.textRuns.map((r) => r.text).join("");
  requests.push({
    insertText: {
      location: { index: currentIndex },
      text: codeText + "\n",
    },
  });

  const codeStartIndex = currentIndex;
  const codeEndIndex = currentIndex + codeText.length;
  const nextIndex = codeEndIndex + 1;

  // Apply monospace font
  requests.push({
    updateTextStyle: {
      range: {
        startIndex: codeStartIndex,
        endIndex: codeEndIndex,
      },
      textStyle: {
        weightedFontFamily: {
          fontFamily: "Courier New",
        },
      },
      fields: "weightedFontFamily",
    },
  });

  // Apply background color and spacing for code blocks
  requests.push({
    updateParagraphStyle: {
      range: {
        startIndex: codeStartIndex,
        endIndex: codeEndIndex + 1,
      },
      paragraphStyle: {
        shading: {
          backgroundColor: {
            color: {
              rgbColor: {
                red: 0.95,
                green: 0.95,
                blue: 0.95,
              },
            },
          },
        },
        spaceBelow: {
          magnitude: 12,
          unit: "PT",
        },
      },
      fields: "shading.backgroundColor,spaceBelow",
    },
  });

  return nextIndex;
}

/**
 * Insert regular paragraph with formatting
 */
function insertParagraph(
  para: Paragraph,
  currentIndex: number,
  requests: any[]
): number {
  let paraText = "";
  const textRunRanges: Array<{
    start: number;
    end: number;
    run: TextRun;
  }> = [];

  for (const run of para.textRuns) {
    const start = currentIndex + paraText.length;
    paraText += run.text;
    const end = currentIndex + paraText.length;
    textRunRanges.push({ start, end, run });
  }

  if (!paraText.trim()) {
    return currentIndex;
  }

  // Insert paragraph text
  requests.push({
    insertText: {
      location: { index: currentIndex },
      text: paraText + "\n",
    },
  });

  const paraEndIndex = currentIndex + paraText.length + 1;
  const paragraphStyleUpdates: any = {};
  let fieldsToUpdate: string[] = [];

  // Set heading style if applicable
  if (para.heading) {
    paragraphStyleUpdates.namedStyleType = para.heading;
    fieldsToUpdate.push("namedStyleType");
  }

  // Add spacing after paragraphs
  const spacingAfter = para.heading || para.listType ? 18 : 12;
  paragraphStyleUpdates.spaceBelow = {
    magnitude: spacingAfter,
    unit: "PT",
  };
  fieldsToUpdate.push("spaceBelow");

  // Apply paragraph style with spacing
  if (fieldsToUpdate.length > 0) {
    requests.push({
      updateParagraphStyle: {
        range: {
          startIndex: currentIndex,
          endIndex: paraEndIndex,
        },
        paragraphStyle: paragraphStyleUpdates,
        fields: fieldsToUpdate.join(","),
      },
    });
  }

  // Apply list formatting if needed
  if (para.listType) {
    requests.push({
      createParagraphBullets: {
        range: {
          startIndex: currentIndex,
          endIndex: paraEndIndex - 1,
        },
        bulletPreset:
          para.listType === "UNORDERED_LIST"
            ? "BULLET_DISC_CIRCLE_SQUARE"
            : "NUMBERED_DECIMAL_ALPHA_ROMAN",
      },
    });
  }

  // Apply text run formatting
  for (const { start, end, run } of textRunRanges) {
    const textStyle: any = {};
    let hasStyle = false;

    if (run.bold) {
      textStyle.bold = true;
      hasStyle = true;
    }
    if (run.italic) {
      textStyle.italic = true;
      hasStyle = true;
    }
    if (run.link) {
      textStyle.link = { url: run.link };
      hasStyle = true;
    }
    if (run.foregroundColor) {
      textStyle.foregroundColor = run.foregroundColor;
      hasStyle = true;
    }

    if (hasStyle) {
      requests.push({
        updateTextStyle: {
          range: {
            startIndex: start,
            endIndex: end,
          },
          textStyle,
          fields: Object.keys(textStyle).join(","),
        },
      });
    }
  }

  return paraEndIndex;
}

