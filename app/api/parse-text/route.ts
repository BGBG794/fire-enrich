import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { text, format } = body;

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const lines = text.trim().split("\n").filter(l => l.trim());
  if (lines.length === 0) {
    return NextResponse.json({ error: "Empty text" }, { status: 400 });
  }

  // Auto-detect format
  const detectedFormat = format || detectFormat(text);

  if (detectedFormat === "json") {
    try {
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      const stringRows = rows.map(r => Object.fromEntries(
        Object.entries(r).map(([k, v]) => [k, v != null ? String(v) : ""])
      ));
      const columns = [...new Set(stringRows.flatMap(r => Object.keys(r)))];
      return NextResponse.json({ rows: stringRows, columns, format: "json" });
    } catch {}
  }

  if (detectedFormat === "tsv" || detectedFormat === "csv") {
    const delimiter = detectedFormat === "tsv" ? "\t" : ",";
    const headerLine = lines[0];
    const headers = headerLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ""));

    const rows = lines.slice(1).map(line => {
      const values = line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] || ""; });
      return row;
    });

    return NextResponse.json({ rows, columns: headers, format: detectedFormat });
  }

  // Unstructured text -> use AI
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY required for unstructured text" }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey: openaiKey });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: `Parse this text into a JSON array of objects with consistent keys. Use lowercase_with_underscores for key names. Ensure all values are strings. Only return the JSON array.\n\nText:\n${text.substring(0, 20000)}`,
    }],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const responseText = completion.choices[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(responseText);
    const rows = Array.isArray(parsed) ? parsed : (parsed.data || parsed.rows || parsed.items || []);
    const stringRows = rows.map((r: any) => Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, v != null ? String(v) : ""])
    ));
    const columns = [...new Set(stringRows.flatMap((r: any) => Object.keys(r)))];
    return NextResponse.json({ rows: stringRows, columns, format: "ai" });
  } catch {
    return NextResponse.json({ error: "Failed to parse text" }, { status: 500 });
  }
}

function detectFormat(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return "json";

  const lines = trimmed.split("\n");
  if (lines.length < 2) return "unstructured";

  // Check for tabs in first line
  if (lines[0].includes("\t")) return "tsv";

  // Check for consistent comma count
  const commaCount = (lines[0].match(/,/g) || []).length;
  if (commaCount > 0) {
    const secondLineCommas = (lines[1].match(/,/g) || []).length;
    if (Math.abs(commaCount - secondLineCommas) <= 1) return "csv";
  }

  // Check for pipe-separated
  if (lines[0].includes("|")) return "csv"; // treat pipe as csv-like

  return "unstructured";
}
