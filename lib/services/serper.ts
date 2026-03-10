import type { SearchResult } from '../types';

interface SerperSearchResult {
  title: string;
  link: string;
  snippet: string;
  position?: number;
}

interface SerperResponse {
  organic: SerperSearchResult[];
  searchParameters?: {
    q: string;
    gl?: string;
    hl?: string;
  };
}

export class SerperService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(
    query: string,
    options: {
      limit?: number;
      scrapeContent?: boolean;
    } = {}
  ): Promise<SearchResult[]> {
    const { limit = 5 } = options;
    const maxRetries = 3;
    const baseDelay = 1000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: query,
            num: limit,
          }),
        });

        if (response.status === 402 || response.status === 403) {
          console.error('Serper: Invalid API key or insufficient credits.');
          throw new Error('Serper: Invalid API key or insufficient credits.');
        }

        if (response.status === 429) {
          if (attempt < maxRetries - 1) {
            const delay = baseDelay * Math.pow(2, attempt);
            console.warn(`Serper rate limited (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          console.error('Serper: Rate limited after all retries.');
          return [];
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Serper error (${response.status}):`, errorText);
          if (attempt < maxRetries - 1) {
            const delay = baseDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          return [];
        }

        const data: SerperResponse = await response.json();

        if (!data.organic || data.organic.length === 0) {
          return [];
        }

        return data.organic.slice(0, limit).map((item) => ({
          url: item.link,
          title: item.title,
          description: item.snippet,
          // Serper doesn't scrape page content — snippets only
          // This is fine: the AI extraction works well with Google snippets
          markdown: undefined,
          html: undefined,
          links: undefined,
          metadata: undefined,
        }));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';

        // Fatal errors — don't retry
        if (errorMsg.includes('Invalid API key') || errorMsg.includes('insufficient credits')) {
          throw error;
        }

        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.warn(`Serper search failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        console.error('Serper search error:', error);
        console.error('Query:', query);
        return [];
      }
    }

    return [];
  }
}
