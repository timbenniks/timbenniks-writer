export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  link?: string;
  foregroundColor?: { color: { rgbColor: { red: number; green: number; blue: number } } };
}

export interface Paragraph {
  textRuns: TextRun[];
  heading?: "HEADING_1" | "HEADING_2" | "HEADING_3" | "NORMAL_TEXT";
  listType?: "ORDERED_LIST" | "UNORDERED_LIST";
  isCodeBlock?: boolean;
  imageUrl?: string;
}

