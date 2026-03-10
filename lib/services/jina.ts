export class JinaService {
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async scrape(url: string): Promise<string | null> {
    try {
      const headers: Record<string, string> = {
        'Accept': 'text/plain',
      };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`https://r.jina.ai/${url}`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.warn(`Jina scrape failed for ${url}: ${response.status}`);
        return null;
      }

      const text = await response.text();

      // Truncate to avoid sending too much to OpenAI
      if (text.length > 15000) {
        return text.substring(0, 15000);
      }

      return text;
    } catch (error) {
      console.warn(`Jina scrape error for ${url}:`, error instanceof Error ? error.message : error);
      return null;
    }
  }
}
