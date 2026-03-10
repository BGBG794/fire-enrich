import { NextRequest, NextResponse } from 'next/server';
import { AgentEnrichmentStrategy } from '@/lib/strategies/agent-enrichment-strategy';
import { PipelineExecutor } from '@/lib/pipeline/pipeline-executor';
import type { SearchService } from '@/lib/pipeline/pipeline-executor';
import { SerperService } from '@/lib/services/serper';
import { FirecrawlService } from '@/lib/services/firecrawl';
import type { EnrichmentRequest, RowEnrichmentResult, PipelineConfig } from '@/lib/types';
import { loadSkipList, shouldSkipEmail, getSkipReason } from '@/lib/utils/skip-list';
import { ENRICHMENT_CONFIG } from '@/lib/config/enrichment';
import { saveEnrichmentResult, updateProjectStatus } from '@/lib/db/queries';

// Use Node.js runtime for better compatibility
export const runtime = 'nodejs';

// Store active sessions in memory (in production, use Redis or similar)
const activeSessions = new Map<string, AbortController>();

export async function POST(request: NextRequest) {
  try {
    // Add request body size check
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) { // 5MB limit
      return NextResponse.json(
        { error: 'Request body too large' },
        { status: 413 }
      );
    }

    const body = await request.json();
    const { rows, fields, emailColumn, nameColumn, projectId, enrichmentMode = 'standard' } = body as EnrichmentRequest & { projectId?: string };
    const pipelineConfig = body.pipelineConfig as PipelineConfig | undefined;
    const isPipeline = !!pipelineConfig;

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: 'No rows provided' },
        { status: 400 }
      );
    }

    // Validation differs between standard and pipeline mode
    if (!isPipeline) {
      if (!fields || fields.length === 0 || fields.length > 10) {
        return NextResponse.json(
          { error: 'Please provide 1-10 fields to enrich' },
          { status: 400 }
        );
      }

      if (!emailColumn) {
        return NextResponse.json(
          { error: 'Email column is required' },
          { status: 400 }
        );
      }
    } else {
      if (!pipelineConfig.steps || pipelineConfig.steps.length === 0) {
        return NextResponse.json(
          { error: 'Pipeline must have at least one step' },
          { status: 400 }
        );
      }
      if (!pipelineConfig.identifierColumn) {
        return NextResponse.json(
          { error: 'Pipeline must have an identifier column' },
          { status: 400 }
        );
      }
    }

    // Use a more compatible UUID generation
    const sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const abortController = new AbortController();
    activeSessions.set(sessionId, abortController);

    // Check environment variables and headers for API keys
    const openaiApiKey = process.env.OPENAI_API_KEY || request.headers.get('X-OpenAI-API-Key');
    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY || request.headers.get('X-Firecrawl-API-Key');
    const serperApiKey = process.env.SERPER_API_KEY || request.headers.get('X-Serper-API-Key') || undefined;
    const jinaApiKey = process.env.JINA_API_KEY || request.headers.get('X-Jina-API-Key') || undefined;
    const anyleadsApiKey = process.env.ANYLEADS_API_KEY || request.headers.get('X-Anyleads-API-Key') || undefined;

    // For pipeline mode, either Serper or Firecrawl is needed for search
    const hasSearchProvider = serperApiKey || firecrawlApiKey;

    if (!openaiApiKey || !hasSearchProvider) {
      console.error('Missing API keys:', {
        hasOpenAI: !!openaiApiKey,
        hasFirecrawl: !!firecrawlApiKey,
        hasSerper: !!serperApiKey,
      });
      return NextResponse.json(
        { error: 'Server configuration error: Missing API keys. Need OpenAI + (Serper or Firecrawl).' },
        { status: 500 }
      );
    }

    // Initialize strategy based on mode
    let enrichmentStrategy: AgentEnrichmentStrategy | null = null;
    let pipelineExecutor: PipelineExecutor | null = null;

    if (isPipeline) {
      // Prefer Serper (cheaper) over Firecrawl for pipeline search
      let searchService: SearchService;
      if (serperApiKey) {
        console.log(`[STRATEGY] Using Serper for search (pipeline mode)`);
        searchService = new SerperService(serperApiKey);
      } else {
        console.log(`[STRATEGY] Using Firecrawl for search (pipeline mode, no Serper key)`);
        searchService = new FirecrawlService(firecrawlApiKey!);
      }
      console.log(`[STRATEGY] Using PipelineExecutor - ${pipelineConfig.steps.length} steps`);
      pipelineExecutor = new PipelineExecutor(searchService, openaiApiKey, anyleadsApiKey, jinaApiKey);
    } else {
      const strategyName = 'AgentEnrichmentStrategy';
      console.log(`[STRATEGY] Using ${strategyName} - Advanced multi-agent architecture`);
      enrichmentStrategy = new AgentEnrichmentStrategy(openaiApiKey, firecrawlApiKey);
    }

    // Load skip list
    const skipList = await loadSkipList();

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send session ID
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`
            )
          );

          // Process rows with rolling concurrency (as each finishes, start the next)
          const concurrency = isPipeline ? 1 : ENRICHMENT_CONFIG.CONCURRENT_ROWS; // Pipeline runs sequentially per row
          console.log(`[ENRICHMENT] Processing ${rows.length} rows with ${isPipeline ? 'pipeline mode' : `rolling concurrency: ${concurrency}`}`);

          // Send pending status for all rows
          for (let i = 0; i < rows.length; i++) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'pending',
                  rowIndex: i,
                  totalRows: rows.length,
                })}\n\n`
              )
            );
          }

          // Process rows
          const processRow = async (i: number) => {
            // Check if cancelled
            if (abortController.signal.aborted) {
              return;
            }

            const row = rows[i];

            // Skip list check (only for standard mode with email)
            if (!isPipeline) {
              const email = row[emailColumn];

              // Add name to row context if nameColumn is provided
              if (nameColumn && row[nameColumn]) {
                row._name = row[nameColumn];
              }

              if (email && shouldSkipEmail(email, skipList)) {
                const skipReason = getSkipReason(email, skipList);
                const skipResult: RowEnrichmentResult = {
                  rowIndex: i,
                  originalData: row,
                  enrichments: {},
                  status: 'skipped',
                  error: skipReason,
                };

                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'result', result: skipResult })}\n\n`
                  )
                );

                if (projectId) {
                  try { await saveEnrichmentResult(projectId, i, {}, 'skipped', skipReason); } catch (e) { console.error('[DB] Failed to save skip result:', e); }
                }
                return;
              }
            }

            // Send processing status
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'processing',
                  rowIndex: i,
                  totalRows: rows.length,
                })}\n\n`
              )
            );

            try {
              const startTime = Date.now();
              let result: RowEnrichmentResult;

              if (isPipeline && pipelineExecutor && pipelineConfig) {
                // Pipeline mode
                const identifier = row[pipelineConfig.identifierColumn] || `Row ${i + 1}`;
                console.log(`[PIPELINE] Processing row ${i + 1}/${rows.length} - ${identifier}`);

                result = await pipelineExecutor.executeRow(
                  row,
                  pipelineConfig,
                  (message: string, type: 'info' | 'success' | 'warning' | 'agent') => {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          type: 'agent_progress',
                          rowIndex: i,
                          message,
                          messageType: type,
                        })}\n\n`
                      )
                    );
                  },
                  (stepId: string, stepName: string, message: string) => {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          type: 'step_progress',
                          rowIndex: i,
                          stepId,
                          stepName,
                          message,
                        })}\n\n`
                      )
                    );
                  },
                  (stepId: string, stepResult) => {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          type: 'step_complete',
                          rowIndex: i,
                          stepId,
                          stepResult,
                        })}\n\n`
                      )
                    );
                  },
                );
              } else if (enrichmentStrategy) {
                // Standard mode
                const email = row[emailColumn];
                console.log(`[ENRICHMENT] Processing row ${i + 1}/${rows.length} - Email: ${email}`);

                result = await enrichmentStrategy.enrichRow(
                  row,
                  fields,
                  emailColumn,
                  undefined,
                  (message: string, type: 'info' | 'success' | 'warning' | 'agent', sourceUrl?: string) => {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          type: 'agent_progress',
                          rowIndex: i,
                          message,
                          messageType: type,
                          sourceUrl,
                        })}\n\n`
                      )
                    );
                  },
                  enrichmentMode
                );
              } else {
                throw new Error('No enrichment strategy configured');
              }

              result.rowIndex = i;

              const duration = Date.now() - startTime;
              console.log(`[ENRICHMENT] Completed row ${i + 1} in ${duration}ms - Fields enriched: ${Object.keys(result.enrichments).length}`);

              // Persist result to DB
              if (projectId) {
                try { await saveEnrichmentResult(projectId, i, result.enrichments, result.status, result.error); } catch (e) { console.error('[DB] Failed to save result:', e); }
              }

              // Send result
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'result', result })}\n\n`
                )
              );
            } catch (error) {
              const errorResult: RowEnrichmentResult = {
                rowIndex: i,
                originalData: row,
                enrichments: {},
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
              };

              if (projectId) {
                try { await saveEnrichmentResult(projectId, i, {}, 'error', errorResult.error); } catch (e) { console.error('[DB] Failed to save error result:', e); }
              }

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'result', result: errorResult })}\n\n`
                )
              );
            }
          };

          // Create a queue and process with rolling concurrency
          let currentIndex = 0;
          const activePromises: Promise<void>[] = [];

          while (currentIndex < rows.length || activePromises.length > 0) {
            // Check if cancelled
            if (abortController.signal.aborted) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'cancelled' })}\n\n`
                )
              );
              break;
            }

            // Start new rows up to concurrency limit
            while (currentIndex < rows.length && activePromises.length < concurrency) {
              const rowIndex = currentIndex++;
              const promise = processRow(rowIndex).then(() => {
                // Remove this promise from active list when done
                const index = activePromises.indexOf(promise);
                if (index > -1) {
                  activePromises.splice(index, 1);
                }
              });
              activePromises.push(promise);
            }

            // Wait for at least one to finish before continuing
            if (activePromises.length > 0) {
              await Promise.race(activePromises);
            }
          }

          // Update project status
          if (projectId) {
            try { await updateProjectStatus(projectId, 'completed'); } catch (e) { console.error('[DB] Failed to update project status:', e); }
          }

          // Send completion
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'complete' })}\n\n`
            )
          );
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
              })}\n\n`
            )
          );
        } finally {
          activeSessions.delete(sessionId);
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Failed to start enrichment:', error);
    return NextResponse.json(
      { 
        error: 'Failed to start enrichment',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Cancel endpoint
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json(
      { error: 'Session ID required' },
      { status: 400 }
    );
  }

  const controller = activeSessions.get(sessionId);
  if (controller) {
    controller.abort();
    activeSessions.delete(sessionId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: 'Session not found' },
    { status: 404 }
  );
}