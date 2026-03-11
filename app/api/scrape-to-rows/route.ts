import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { url, instructions } = body;

  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY required" }, { status: 400 });
  }

  let markdown = "";

  // Try Firecrawl first
  if (firecrawlKey) {
    try {
      const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${firecrawlKey}`,
        },
        body: JSON.stringify({ url, formats: ["markdown"] }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await resp.json();
      if (data.success && data.data?.markdown) {
        markdown = data.data.markdown;
      }
    } catch {}
  }

  // Fallback: fetch directly
  if (!markdown) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      });
      const html = await resp.text();
      // Simple HTML to text
      markdown = html.replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .substring(0, 50000);
    } catch (e: any) {
      return NextResponse.json({ error: `Failed to fetch URL: ${e.message}` }, { status: 400 });
    }
  }

  // Use OpenAI to extract structured data
  const openai = new OpenAI({ apiKey: openaiKey });
  const prompt = `Extract all structured/tabular data from this web page content into a JSON array of objects.
Each object should represent one entity (business, person, item, etc.) with consistent keys.
Use lowercase_with_underscores for key names.
If the page has a list of businesses/agencies, extract: name, address, phone, email, website, etc.
Only return the JSON array, nothing else.
${instructions ? `\nAdditional instructions: ${instructions}` : ''}

Web page content:
${markdown.substring(0, 30000)}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const responseText = completion.choices[0]?.message?.content || "{}";
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
  }

  // Handle both { data: [...] } and [...] formats
  const rows = Array.isArray(parsed) ? parsed : (parsed.data || parsed.rows || parsed.items || parsed.results || []);

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No structured data found on this page" }, { status: 404 });
  }

  // Ensure all values are strings (for CSVRow compatibility)
  const stringRows = rows.map((row: any) => {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      result[key] = value != null ? String(value) : "";
    }
    return result;
  });

  const columns = [...new Set(stringRows.flatMap(r => Object.keys(r)))];

  return NextResponse.json({ rows: stringRows, columns });
}
