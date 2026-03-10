export interface KasprEmployee {
  first_name: string;
  last_name: string;
  headline: string;
  job_title: string;
  location: string;
  business_email: string;
  personal_email: string;
  phone: string;
  social_url: string;
  company_name: string;
  company_domain: string;
  company_industry: string;
  company_phone: string;
  company_size: string;
  company_linkedin_url: string;
  company_founded: string;
  linkedin_id: number;
}

export interface KasprSiteData {
  domain: string;
  title: string;
  description: string;
  company_email: string | null;
  phones: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  youtube_url: string | null;
}

export interface KasprCompanyMatch {
  name: string;
  domain: string;
  logo: string | null;
}

export class KasprService {
  private apiKey: string;
  private baseUrl = 'https://myapiconnect.com/api-product/incoming-webhook';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async post<T>(endpoint: string, data: Record<string, string>): Promise<T | null> {
    try {
      const response = await fetch(`${this.baseUrl}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: this.apiKey, ...data }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        console.error(`[KASPR] ${endpoint} HTTP ${response.status}`);
        return null;
      }
      return response.json() as Promise<T>;
    } catch (error) {
      console.error(`[KASPR] ${endpoint} error:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Convert a company name to its domain.
   */
  async convertCompanyName(companyName: string): Promise<string | null> {
    const res = await this.post<{ state: boolean; data: KasprCompanyMatch[] }>(
      'convert-company-names',
      { company_name: companyName },
    );
    if (res?.state && res.data?.length > 0) return res.data[0].domain;
    return null;
  }

  /**
   * Enrich a company by domain — returns all employees with emails, phones, LinkedIn.
   */
  async enrichCompany(domain: string): Promise<KasprEmployee[]> {
    const res = await this.post<{ state: boolean; employees: KasprEmployee[] }>(
      'enrich-company',
      { domain },
    );
    if (res?.state && res.employees) return res.employees;
    return [];
  }

  /**
   * Extract emails, phones, and social media from a website URL.
   */
  async extractFromUrl(url: string): Promise<KasprSiteData | null> {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const res = await this.post<{ state: boolean; data: KasprSiteData }>(
      'extract-emails-from-urls',
      { url: fullUrl },
    );
    if (res?.state && res.data) return res.data;
    return null;
  }

  /**
   * Find an email from first name, last name, and domain.
   */
  async findEmail(firstName: string, lastName: string, domain: string): Promise<string | null> {
    const res = await this.post<{ state: boolean; data: { email?: string } }>(
      'find-emails-first-last',
      { first_name: firstName, last_name: lastName, domain },
    );
    if (res?.state && res.data?.email) return res.data.email;
    return null;
  }

  /**
   * Verify if an email is valid.
   */
  async verifyEmail(email: string): Promise<{ valid: boolean; status: string }> {
    const res = await this.post<{ state: boolean; data: { state?: string; result?: string } }>(
      'verify-email-state',
      { email },
    );
    if (res?.state && res.data) {
      const valid = res.data.state === 'valid' || res.data.result === 'deliverable';
      return { valid, status: res.data.state || res.data.result || 'unknown' };
    }
    return { valid: false, status: 'error' };
  }
}
