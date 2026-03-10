export interface AnyleadsEmailResult {
  email: string;
  score?: number;
}

export interface AnyleadsVerifyResult {
  email: string;
  isValid: boolean;
  status?: string;
}

export class AnyleadsService {
  private apiKey: string;
  private baseUrl = 'https://app.anyleads.com/api/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateByDomain(
    domain: string,
    firstName: string,
    lastName: string
  ): Promise<AnyleadsEmailResult | null> {
    try {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        domain,
        first_name: firstName,
        last_name: lastName,
      });

      const response = await fetch(`${this.baseUrl}/email/generate?${params}`);
      if (!response.ok) {
        console.error(`[Anyleads] generateByDomain failed: ${response.status}`);
        return null;
      }

      const data = await response.json();
      if (data.email) {
        return { email: data.email, score: data.score };
      }
      return null;
    } catch (error) {
      console.error('[Anyleads] generateByDomain error:', error);
      return null;
    }
  }

  async verify(email: string): Promise<AnyleadsVerifyResult> {
    try {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        email,
      });

      const response = await fetch(`${this.baseUrl}/email/verify?${params}`);
      if (!response.ok) {
        console.error(`[Anyleads] verify failed: ${response.status}`);
        return { email, isValid: false, status: 'error' };
      }

      const data = await response.json();
      return {
        email,
        isValid: data.status === 'valid' || data.result === 'deliverable',
        status: data.status || data.result,
      };
    } catch (error) {
      console.error('[Anyleads] verify error:', error);
      return { email, isValid: false, status: 'error' };
    }
  }

  async searchDomain(domain: string): Promise<AnyleadsEmailResult[]> {
    try {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        domain,
      });

      const response = await fetch(`${this.baseUrl}/email/search?${params}`);
      if (!response.ok) {
        console.error(`[Anyleads] searchDomain failed: ${response.status}`);
        return [];
      }

      const data = await response.json();
      if (Array.isArray(data.emails)) {
        return data.emails.map((e: { email: string; score?: number }) => ({
          email: e.email,
          score: e.score,
        }));
      }
      return [];
    } catch (error) {
      console.error('[Anyleads] searchDomain error:', error);
      return [];
    }
  }
}
