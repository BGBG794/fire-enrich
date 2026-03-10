import { OpenAIService } from '../services/openai';
import { AnyleadsService } from '../services/anyleads';
import { JinaService } from '../services/jina';
import type {
  CSVRow,
  PipelineConfig,
  PipelineStep,
  StepResult,
  SearchResult,
  EnrichmentResult,
  EnrichmentField,
  RowEnrichmentResult,
} from '../types';

export interface SearchService {
  search(query: string, options?: { limit?: number; scrapeContent?: boolean }): Promise<SearchResult[]>;
}

type ProgressCallback = (message: string, type: 'info' | 'success' | 'warning' | 'agent') => void;
type StepProgressCallback = (stepId: string, stepName: string, message: string) => void;
type StepCompleteCallback = (stepId: string, result: StepResult) => void;

export class PipelineExecutor {
  private searchService: SearchService;
  private openai: OpenAIService;
  private anyleads?: AnyleadsService;
  private jina: JinaService;

  constructor(
    searchService: SearchService,
    openaiApiKey: string,
    anyleadsApiKey?: string,
    jinaApiKey?: string,
  ) {
    this.searchService = searchService;
    this.openai = new OpenAIService(openaiApiKey);
    this.jina = new JinaService(jinaApiKey);
    if (anyleadsApiKey) {
      this.anyleads = new AnyleadsService(anyleadsApiKey);
    }
  }

  async executeRow(
    row: CSVRow,
    pipeline: PipelineConfig,
    onProgress?: ProgressCallback,
    onStepProgress?: StepProgressCallback,
    onStepComplete?: StepCompleteCallback,
  ): Promise<RowEnrichmentResult> {
    const accumulatedContext: Record<string, Record<string, unknown>> = {};
    const allEnrichments: Record<string, EnrichmentResult> = {};

    const identifier = row[pipeline.identifierColumn] || 'Unknown';
    onProgress?.(`Starting pipeline for "${identifier}"`, 'info');

    const sortedSteps = [...pipeline.steps].sort((a, b) => a.order - b.order);

    for (const step of sortedSteps) {
      onStepProgress?.(step.id, step.name, `Starting step: ${step.name}`);
      onProgress?.(`Step ${step.order + 1}/${sortedSteps.length}: ${step.name}`, 'agent');

      try {
        const stepResult = await this.executeStep(row, step, accumulatedContext, pipeline, onProgress);

        // Store in accumulated context for next steps
        const stepValues: Record<string, unknown> = {};
        for (const [fieldName, result] of Object.entries(stepResult.fields)) {
          stepValues[fieldName] = result.value;
        }
        accumulatedContext[step.id] = stepValues;

        // Flatten into allEnrichments with namespaced keys: StepName__fieldName
        for (const [fieldName, result] of Object.entries(stepResult.fields)) {
          const namespacedKey = `${step.name}__${fieldName}`;
          allEnrichments[namespacedKey] = result;
        }

        onStepComplete?.(step.id, stepResult);
        onProgress?.(`Completed: ${step.name} (${Object.keys(stepResult.fields).length} fields)`, 'success');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Pipeline] Step "${step.name}" failed:`, error);
        onProgress?.(`Step "${step.name}" failed: ${errorMsg}`, 'warning');

        const failedResult: StepResult = {
          stepId: step.id,
          stepName: step.name,
          fields: {},
          status: 'error',
          error: errorMsg,
        };
        onStepComplete?.(step.id, failedResult);
      }
    }

    return {
      rowIndex: 0,
      originalData: row,
      enrichments: allEnrichments,
      status: 'completed',
    };
  }

  private async executeStep(
    row: CSVRow,
    step: PipelineStep,
    accumulatedContext: Record<string, Record<string, unknown>>,
    pipeline: PipelineConfig,
    onProgress?: ProgressCallback,
  ): Promise<StepResult> {
    switch (step.type) {
      case 'web_research':
        return this.executeWebResearch(row, step, accumulatedContext, pipeline, onProgress);
      case 'ai_analysis':
        return this.executeAIAnalysis(row, step, accumulatedContext, pipeline, onProgress);
      case 'contact_search':
        return this.executeContactSearch(row, step, accumulatedContext, pipeline, onProgress);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  private buildContextString(
    row: CSVRow,
    step: PipelineStep,
    accumulatedContext: Record<string, Record<string, unknown>>,
    pipeline: PipelineConfig,
  ): string {
    const parts: string[] = [];

    // Add CSV columns
    parts.push('=== Original Data ===');
    for (const col of step.inputColumns) {
      if (row[col]) {
        parts.push(`${col}: ${row[col]}`);
      }
    }

    // Add accumulated context from previous steps
    if (step.usePreviousSteps) {
      const sortedSteps = [...pipeline.steps].sort((a, b) => a.order - b.order);
      for (const prevStep of sortedSteps) {
        if (prevStep.order >= step.order) break;
        const prevData = accumulatedContext[prevStep.id];
        if (prevData && Object.keys(prevData).length > 0) {
          parts.push(`\n=== From "${prevStep.name}" ===`);
          for (const [key, value] of Object.entries(prevData)) {
            if (value !== null && value !== undefined) {
              const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
              parts.push(`${key}: ${displayValue}`);
            }
          }
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * Build smart search queries using CSV row data (country, sector, etc.)
   * and the step prompt. Returns multiple queries for fallback.
   */
  private buildSearchQueries(
    row: CSVRow,
    step: PipelineStep,
    pipeline: PipelineConfig,
  ): string[] {
    const identifier = row[pipeline.identifierColumn] || '';
    const queries: string[] = [];

    // Extract useful context columns (country, sector, etc.)
    const extraContext: string[] = [];
    for (const col of step.inputColumns) {
      const val = row[col];
      if (val && col !== pipeline.identifierColumn) {
        extraContext.push(String(val));
      }
    }
    // Also scan all row columns for common geo/sector fields
    const geoKeys = ['pays', 'country', 'location', 'ville', 'city', 'region'];
    const sectorKeys = ['secteur', 'sector', 'industry', 'industrie', 'activité', 'activity'];
    let country = '';
    let sector = '';
    for (const [key, val] of Object.entries(row)) {
      if (!val) continue;
      const lk = key.toLowerCase();
      if (!country && geoKeys.some(g => lk.includes(g))) country = String(val);
      if (!sector && sectorKeys.some(s => lk.includes(s))) sector = String(val);
    }

    // Extract a short keyword from the prompt (first meaningful words)
    const promptKeywords = step.prompt
      .replace(/[.,;:!?()\[\]{}]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 6)
      .join(' ');

    // Query 1: identifier + country + prompt keywords (most specific)
    const q1Parts = [identifier, country, promptKeywords].filter(Boolean);
    queries.push(q1Parts.join(' '));

    // Query 2: identifier + prompt keywords (without country, broader)
    if (country) {
      queries.push([identifier, promptKeywords].filter(Boolean).join(' '));
    }

    // Query 3: identifier + sector + step name (different angle)
    if (sector) {
      queries.push([identifier, sector, step.name].filter(Boolean).join(' '));
    }

    // Query 4: just the company name (last resort fallback)
    if (queries.length > 0 && queries[0] !== identifier) {
      queries.push(identifier);
    }

    return queries;
  }

  private async executeWebResearch(
    row: CSVRow,
    step: PipelineStep,
    accumulatedContext: Record<string, Record<string, unknown>>,
    pipeline: PipelineConfig,
    onProgress?: ProgressCallback,
  ): Promise<StepResult> {
    const identifier = row[pipeline.identifierColumn] || '';
    const contextString = this.buildContextString(row, step, accumulatedContext, pipeline);

    const queries = this.buildSearchQueries(row, step, pipeline);
    onProgress?.(`Searching web for: ${identifier} (${queries.length} queries)`, 'info');

    // Try queries in order until we get results
    let searchResults: SearchResult[] = [];
    let usedQuery = '';
    for (const query of queries) {
      onProgress?.(`Trying: "${query.substring(0, 80)}"`, 'info');
      searchResults = await this.searchService.search(query, {
        limit: 5,
        scrapeContent: true,
      });
      if (searchResults.length > 0) {
        usedQuery = query;
        break;
      }
      onProgress?.(`No results, trying next query...`, 'warning');
    }

    if (searchResults.length === 0) {
      onProgress?.(`No search results found for "${identifier}" after ${queries.length} attempts`, 'warning');
      return {
        stepId: step.id,
        stepName: step.name,
        fields: {},
        status: 'completed',
      };
    }

    onProgress?.(`Found ${searchResults.length} sources with query "${usedQuery.substring(0, 60)}", extracting...`, 'info');

    // Scrape the top result with Jina for full page content
    const topResult = searchResults[0];
    let scrapedContent: string | null = null;
    if (topResult && !topResult.markdown) {
      onProgress?.(`Scraping: ${topResult.url.substring(0, 80)}...`, 'info');
      scrapedContent = await this.jina.scrape(topResult.url);
      if (scrapedContent) {
        onProgress?.(`Scraped ${Math.round(scrapedContent.length / 1000)}k chars from top result`, 'success');
      }
    }

    // Build content: scraped top result + snippets from the rest
    const contentParts: string[] = [];
    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      contentParts.push(`URL: ${result.url}`);
      contentParts.push(`Title: ${result.title}`);
      if (i === 0 && scrapedContent) {
        // Full scraped content for the top result
        contentParts.push(scrapedContent);
      } else if (result.markdown) {
        contentParts.push(result.markdown.substring(0, 10000));
      } else if (result.description) {
        contentParts.push(result.description);
      }
      contentParts.push('---');
    }

    const webContent = contentParts.join('\n');

    const fullContent = `${contextString}\n\n=== Web Research Results ===\n${webContent}`;

    const results = await this.openai.extractPipelineData(
      fullContent,
      step.outputFields,
      step.prompt,
      identifier,
    );

    return {
      stepId: step.id,
      stepName: step.name,
      fields: results,
      status: 'completed',
    };
  }

  private async executeAIAnalysis(
    row: CSVRow,
    step: PipelineStep,
    accumulatedContext: Record<string, Record<string, unknown>>,
    pipeline: PipelineConfig,
    onProgress?: ProgressCallback,
  ): Promise<StepResult> {
    const contextString = this.buildContextString(row, step, accumulatedContext, pipeline);
    const identifier = row[pipeline.identifierColumn] || '';
    onProgress?.(`Running AI analysis: ${step.name}`, 'info');

    // For AI analysis, pass accumulated context as content
    const analysisContent = `${contextString}`;

    const results = await this.openai.extractPipelineData(
      analysisContent,
      step.outputFields,
      step.prompt,
      identifier,
    );

    return {
      stepId: step.id,
      stepName: step.name,
      fields: results,
      status: 'completed',
    };
  }

  private async executeContactSearch(
    row: CSVRow,
    step: PipelineStep,
    accumulatedContext: Record<string, Record<string, unknown>>,
    pipeline: PipelineConfig,
    onProgress?: ProgressCallback,
  ): Promise<StepResult> {
    const identifier = row[pipeline.identifierColumn] || '';
    const jobTitles = step.contactSearchConfig?.jobTitles || ['CEO'];
    const fields: Record<string, EnrichmentResult> = {};

    // Extract country for better LinkedIn searches
    let country = '';
    const geoKeys = ['pays', 'country', 'location', 'ville', 'city', 'region'];
    for (const [key, val] of Object.entries(row)) {
      if (!val) continue;
      if (geoKeys.some(g => key.toLowerCase().includes(g))) {
        country = String(val);
        break;
      }
    }

    onProgress?.(`Searching contacts for "${identifier}"${country ? ` (${country})` : ''}...`, 'info');

    for (const title of jobTitles) {
      const safeTitle = title.replace(/[^a-zA-Z0-9\s]/g, '');

      // Try multiple queries for contact search
      const contactQueries = [
        `"${identifier}" "${safeTitle}" site:linkedin.com/in`,
        ...(country ? [`"${identifier}" "${safeTitle}" ${country} site:linkedin.com/in`] : []),
        `${identifier} ${safeTitle} linkedin`,
      ];

      onProgress?.(`Searching LinkedIn: ${identifier} - ${safeTitle}`, 'info');

      let linkedinResults: SearchResult[] = [];
      for (const query of contactQueries) {
        const searchResults = await this.searchService.search(query, {
          limit: 3,
          scrapeContent: false,
        });
        linkedinResults = searchResults.filter(r =>
          r.url.includes('linkedin.com/in/')
        );
        if (linkedinResults.length > 0) break;
      }

      if (linkedinResults.length === 0) {
        onProgress?.(`No LinkedIn profile found for ${safeTitle}`, 'warning');
        continue;
      }

      const linkedinUrl = linkedinResults[0].url;
      const linkedinTitle = linkedinResults[0].title || '';

      onProgress?.(`Found LinkedIn: ${linkedinUrl}`, 'success');

      // Extract name from LinkedIn title (format: "FirstName LastName - Title at Company | LinkedIn")
      const contactFields: EnrichmentField[] = [
        { name: 'firstName', displayName: 'First Name', description: 'First name of the person', type: 'string', required: false },
        { name: 'lastName', displayName: 'Last Name', description: 'Last name of the person', type: 'string', required: false },
        { name: 'jobTitle', displayName: 'Job Title', description: 'Job title of the person', type: 'string', required: false },
      ];

      const nameContext: Record<string, string> = {
        identifier,
        linkedinUrl,
      };

      const nameContent = `LinkedIn Profile: ${linkedinTitle}\nURL: ${linkedinUrl}\nDescription: ${linkedinResults[0].description || ''}`;

      const nameResults = await this.openai.extractStructuredDataOriginal(
        nameContent,
        contactFields,
        nameContext,
      );

      const firstName = nameResults.firstName?.value as string || '';
      const lastName = nameResults.lastName?.value as string || '';
      const jobTitle = nameResults.jobTitle?.value as string || safeTitle;

      // Store LinkedIn info
      const titleKey = safeTitle.replace(/\s+/g, '_');
      fields[`${titleKey}_linkedin_url`] = {
        field: `${titleKey}_linkedin_url`,
        value: linkedinUrl,
        confidence: 0.9,
        source: linkedinUrl,
      };
      fields[`${titleKey}_name`] = {
        field: `${titleKey}_name`,
        value: `${firstName} ${lastName}`.trim(),
        confidence: nameResults.firstName?.confidence || 0.5,
        source: linkedinUrl,
      };
      fields[`${titleKey}_title`] = {
        field: `${titleKey}_title`,
        value: jobTitle,
        confidence: nameResults.jobTitle?.confidence || 0.5,
        source: linkedinUrl,
      };

      // Try to find email via Anyleads
      if (this.anyleads && firstName && lastName) {
        // Extract domain from company name or accumulated context
        let domain = '';

        // Check accumulated context for a domain
        for (const stepData of Object.values(accumulatedContext)) {
          if (stepData.domain) {
            domain = String(stepData.domain);
            break;
          }
          if (stepData.website) {
            domain = String(stepData.website).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
            break;
          }
        }

        // Fallback: try to guess domain from company name
        if (!domain && identifier) {
          domain = identifier
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            + '.com';
        }

        if (domain) {
          onProgress?.(`Looking up email for ${firstName} ${lastName} at ${domain}...`, 'info');

          const emailResult = await this.anyleads.generateByDomain(domain, firstName, lastName);
          if (emailResult) {
            // Verify the email
            const verification = await this.anyleads.verify(emailResult.email);

            fields[`${titleKey}_email`] = {
              field: `${titleKey}_email`,
              value: emailResult.email,
              confidence: verification.isValid ? 0.9 : 0.5,
              source: `anyleads (${verification.isValid ? 'verified' : 'unverified'})`,
            };

            onProgress?.(
              verification.isValid
                ? `Email verified: ${emailResult.email}`
                : `Email found (unverified): ${emailResult.email}`,
              verification.isValid ? 'success' : 'warning'
            );
          } else {
            onProgress?.(`Could not generate email for ${firstName} ${lastName}`, 'warning');
          }
        }
      }
    }

    return {
      stepId: step.id,
      stepName: step.name,
      fields,
      status: 'completed',
    };
  }
}
