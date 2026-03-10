"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CSVRow, EnrichmentField, RowEnrichmentResult, AIColumn, EnrichmentMode, PipelineConfig } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Button from "@/components/shared/button/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ChatPanel, ChatMessage } from "./chat-panel";
import {
  Download,
  X,
  Copy,
  ExternalLink,
  Globe,
  Mail,
  Check,
  ChevronDown,
  ChevronUp,
  Activity,
  CheckCircle,
  AlertCircle,
  Info,
  Plus,
  Sparkles,
  Trash2,
  Loader2,
  RefreshCw,
  Trash,
  Search,
  ArrowUp,
  ArrowDown,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { toast } from "sonner";
import { safeLocalStorage } from "@/lib/utils/safe-storage";

interface EnrichmentTableProps {
  rows: CSVRow[];
  fields: EnrichmentField[];
  emailColumn?: string;
  projectId?: string;
  enrichmentMode?: EnrichmentMode;
  pipelineConfig?: PipelineConfig;
  onStartOutreach?: (projectId: string) => void;
}

export function EnrichmentTable({
  rows,
  fields: fieldsProp,
  emailColumn,
  projectId,
  enrichmentMode = 'standard',
  pipelineConfig,
  onStartOutreach,
}: EnrichmentTableProps) {
  // For pipeline mode, generate fields from the pipeline config with namespaced keys
  const fields: EnrichmentField[] = pipelineConfig
    ? pipelineConfig.steps.flatMap((step) => {
        if (step.type === 'contact_search') {
          // Contact search generates dynamic fields, use placeholders
          return (step.contactSearchConfig?.jobTitles || ['CEO']).flatMap((title) => {
            const titleKey = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
            return [
              { name: `${step.name}__${titleKey}_linkedin_url`, displayName: `${title} LinkedIn`, description: '', type: 'string' as const, required: false },
              { name: `${step.name}__${titleKey}_name`, displayName: `${title} Name`, description: '', type: 'string' as const, required: false },
              { name: `${step.name}__${titleKey}_email`, displayName: `${title} Email`, description: '', type: 'string' as const, required: false },
            ];
          });
        }
        return step.outputFields
          .filter((f) => f.displayName.trim())
          .map((f) => ({
            ...f,
            name: `${step.name}__${f.name}`,
            displayName: `${step.name} - ${f.displayName}`,
          }));
      })
    : fieldsProp;

  // In pipeline mode, use the identifier column as the main display column
  const effectiveEmailColumn = pipelineConfig?.identifierColumn || emailColumn;

  const [results, setResults] = useState<Map<number, RowEnrichmentResult>>(
    new Map(),
  );
  const [status, setStatus] = useState<
    "idle" | "processing" | "completed" | "cancelled"
  >("idle");
  const [currentRow, setCurrentRow] = useState(-1);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [useAgents] = useState(true); // Default to using agents
  const [expandedAgentLogs, setExpandedAgentLogs] = useState(false);
  const [selectedRow, setSelectedRow] = useState<{
    isOpen: boolean;
    row: CSVRow | null;
    result: RowEnrichmentResult | undefined;
    index: number;
  }>({ isOpen: false, row: null, result: undefined, index: -1 });
  const [copiedRow, setCopiedRow] = useState<number | null>(null);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(
    new Set(),
  );
  const [showSkipped, setShowSkipped] = useState(false);
  const [agentMessages, setAgentMessages] = useState<ChatMessage[]>([]);
  const [chatQueryId, setChatQueryId] = useState<string | null>(null);
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [isChatExpanded, setIsChatExpanded] = useState(true);
  const agentMessagesEndRef = useRef<HTMLDivElement>(null);
  const activityScrollRef = useRef<HTMLDivElement>(null);

  // Row management state
  const [checkedRows, setCheckedRows] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    fieldName: string;
    value: string;
  } | null>(null);

  // Table UX state: sorting and filtering
  const [sortConfig, setSortConfig] = useState<{
    key: string; // 'email' | field.name | 'ai:colId' | 'status'
    direction: 'asc' | 'desc';
  } | null>(null);
  const [filterText, setFilterText] = useState("");

  // AI Columns state
  const [aiColumns, setAiColumns] = useState<(AIColumn & { results: Map<number, { value: any; status: string }> })[]>([]);
  const [showAIColumnDialog, setShowAIColumnDialog] = useState(false);
  const [aiColumnPrompt, setAiColumnPrompt] = useState("");
  const [aiColumnName, setAiColumnName] = useState("");
  const [aiColumnType, setAiColumnType] = useState<"string" | "number" | "boolean">("string");
  const [aiColumnLoading, setAiColumnLoading] = useState(false);

  // Cell view mode: compact (truncated) or expanded (full text with wrapping)
  const [cellViewMode, setCellViewMode] = useState<"compact" | "expanded">("compact");

  // Expanded cell tooltip
  const [expandedCell, setExpandedCell] = useState<{
    rowIndex: number;
    fieldName: string;
    value: string;
    rect: { top: number; left: number; width: number };
  } | null>(null);

  // Track when each row's data arrives
  const [rowDataArrivalTime, setRowDataArrivalTime] = useState<
    Map<number, number>
  >(new Map());
  const [cellsShown, setCellsShown] = useState<Set<string>>(new Set());
  const animationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup animation timer on unmount
  useEffect(() => {
    const timer = animationTimerRef.current;
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, []);

  // Auto-scroll to bottom when new agent messages arrive
  useEffect(() => {
    if (activityScrollRef.current) {
      activityScrollRef.current.scrollTop =
        activityScrollRef.current.scrollHeight;
    }
  }, [agentMessages]);

  // Calculate animation delay for each cell
  const getCellAnimationDelay = useCallback(
    (rowIndex: number, fieldIndex: number) => {
      const arrivalTime = rowDataArrivalTime.get(rowIndex);
      if (!arrivalTime) return 0; // No delay if no arrival time

      // Reduced animation time for better UX
      const totalRowAnimationTime = 2000; // 2 seconds
      const delayPerCell = Math.min(300, totalRowAnimationTime / fields.length); // Max 300ms per cell

      // Add delay based on field position
      return fieldIndex * delayPerCell;
    },
    [rowDataArrivalTime, fields.length],
  );

  const startEnrichment = useCallback(async () => {
    setStatus("processing");

    try {
      // Get API keys from localStorage if not in environment
      const firecrawlApiKey = safeLocalStorage.getItem("firecrawl_api_key");
      const openaiApiKey = safeLocalStorage.getItem("openai_api_key");
      const serperApiKey = safeLocalStorage.getItem("serper_api_key");

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(useAgents && { "x-use-agents": "true" }),
      };

      // Add API keys to headers if available
      if (firecrawlApiKey) {
        headers["X-Firecrawl-API-Key"] = firecrawlApiKey;
      }
      if (openaiApiKey) {
        headers["X-OpenAI-API-Key"] = openaiApiKey;
      }
      if (serperApiKey) {
        headers["X-Serper-API-Key"] = serperApiKey;
      }

      const response = await fetch("/api/enrich", {
        method: "POST",
        headers,
        body: JSON.stringify({
          rows,
          fields: fieldsProp,
          emailColumn,
          useAgents,
          useV2Architecture: true,
          projectId,
          enrichmentMode,
          ...(pipelineConfig && { pipelineConfig }),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start enrichment");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.substring(6));

              switch (data.type) {
                case "session":
                  setSessionId(data.sessionId);
                  break;

                case "pending":
                  // Mark row as pending (queued but not yet started)
                  setResults((prev) => {
                    const newMap = new Map(prev);
                    if (!newMap.has(data.rowIndex)) {
                      newMap.set(data.rowIndex, {
                        rowIndex: data.rowIndex,
                        originalData: rows[data.rowIndex],
                        enrichments: {},
                        status: 'pending',
                      });
                    }
                    return newMap;
                  });
                  break;

                case "processing":
                  setCurrentRow(data.rowIndex);
                  // Update status to processing
                  setResults((prev) => {
                    const newMap = new Map(prev);
                    const existing = newMap.get(data.rowIndex);
                    if (existing) {
                      newMap.set(data.rowIndex, {
                        ...existing,
                        status: 'processing',
                      });
                    }
                    return newMap;
                  });
                  break;

                case "result":
                  setResults((prev) => {
                    const newMap = new Map(prev);
                    newMap.set(data.result.rowIndex, data.result);
                    return newMap;
                  });
                  // Track when this row's data arrived
                  setRowDataArrivalTime((prevTime) => {
                    const newMap = new Map(prevTime);
                    newMap.set(data.result.rowIndex, Date.now());
                    return newMap;
                  });

                  // Mark all cells as shown after animation completes
                  setTimeout(() => {
                    const rowCells = fields.map(
                      (f) => `${data.result.rowIndex}-${f.name}`,
                    );
                    setCellsShown((prev) => {
                      const newSet = new Set(prev);
                      rowCells.forEach((cell) => newSet.add(cell));
                      return newSet;
                    });
                  }, 2500); // Slightly after all animations complete
                  break;

                case "complete":
                  setStatus("completed");
                  // Add a final success message (only if not already added)
                  setAgentMessages((prev) => {
                    const hasCompletionMessage = prev.some(
                      (msg) => msg.message === "All enrichment tasks completed successfully"
                    );
                    if (hasCompletionMessage) return prev;

                    return [
                      ...prev,
                      {
                        id: `complete-${Date.now()}`,
                        message: "All enrichment tasks completed successfully",
                        type: "success",
                        timestamp: Date.now(),
                      },
                    ];
                  });
                  break;

                case "cancelled":
                  setStatus("cancelled");
                  break;

                case "error":
                  console.error("Enrichment error:", data.error);
                  setStatus("completed");
                  break;

                case "agent_progress":
                  setAgentMessages((prev) => {
                    const newMessages = [
                      ...prev,
                      {
                        id: `${Date.now()}-${Math.random()}`,
                        message: data.message,
                        type: data.messageType,
                        timestamp: Date.now(),
                        rowIndex: data.rowIndex,
                        sourceUrl: data.sourceUrl, // Include sourceUrl for favicons
                      },
                    ];

                    // Keep messages for all rows, but limit to last 500 total
                    return newMessages.slice(-500);
                  });
                  break;
              }
            } catch {
              // Ignore parsing errors
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to start enrichment:", error);
      setStatus("completed");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldsProp, rows, emailColumn, useAgents, projectId, enrichmentMode, pipelineConfig]);

  // Load existing results from DB if project was previously enriched
  const loadExistingResults = useCallback(async () => {
    if (!projectId) return false;

    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      const project = data.project;

      if (!project || !project.results || project.results.length === 0) {
        return false;
      }

      // Reconstruct results map from DB data
      const resultsMap = new Map<number, RowEnrichmentResult>();

      // Group results by rowId, then map to rowIndex
      const rowIndexMap = new Map<string, number>();
      for (const row of project.rows) {
        rowIndexMap.set(row.id, row.rowIndex);
      }

      const resultsByRow = new Map<number, Record<string, any>>();
      for (const r of project.results) {
        const rowIndex = rowIndexMap.get(r.rowId);
        if (rowIndex === undefined) continue;

        if (!resultsByRow.has(rowIndex)) {
          resultsByRow.set(rowIndex, {});
        }

        if (r.fieldName === "_status") {
          // Status-only result (skipped/error)
          resultsMap.set(rowIndex, {
            rowIndex,
            originalData: rows[rowIndex] || {},
            enrichments: {},
            status: r.status as any,
            error: r.error || undefined,
          });
        } else {
          const enrichments = resultsByRow.get(rowIndex)!;
          enrichments[r.fieldName] = {
            field: r.fieldName,
            value: r.value,
            confidence: r.confidence || 0,
            source: r.source || undefined,
            sourceContext: r.sourceContext || undefined,
          };
        }
      }

      // Build RowEnrichmentResult for rows with field results
      for (const [rowIndex, enrichments] of resultsByRow) {
        if (!resultsMap.has(rowIndex)) {
          resultsMap.set(rowIndex, {
            rowIndex,
            originalData: rows[rowIndex] || {},
            enrichments,
            status: "completed",
          });
        }
      }

      if (resultsMap.size > 0) {
        setResults(resultsMap);
        setStatus("completed");
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }, [projectId, rows]);

  // Load existing AI columns from DB
  const loadAIColumns = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      const project = data.project;
      if (!project?.aiColumns?.length) return;

      // Build row index map: rowId -> rowIndex
      const rowIdToIndex = new Map<string, number>();
      for (const r of project.rows) {
        rowIdToIndex.set(r.id, r.rowIndex);
      }

      const cols = project.aiColumns.map((col: any) => {
        const resultsMap = new Map<number, { value: any; status: string }>();
        for (const r of project.aiColumnResults || []) {
          if (r.columnId === col.id) {
            const rowIndex = rowIdToIndex.get(r.rowId);
            if (rowIndex !== undefined) {
              resultsMap.set(rowIndex, { value: r.value, status: r.status });
            }
          }
        }
        return { ...col, results: resultsMap };
      });

      setAiColumns(cols);
    } catch {}
  }, [projectId]);

  // Create and run a new AI column
  const createAndRunAIColumn = async () => {
    if (!projectId || !aiColumnName.trim() || !aiColumnPrompt.trim()) return;

    setAiColumnLoading(true);

    try {
      const response = await fetch("/api/ai-columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          displayName: aiColumnName.trim(),
          prompt: aiColumnPrompt.trim(),
          type: aiColumnType,
        }),
      });

      if (!response.ok) throw new Error("Failed to create AI column");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      let newColumn: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.substring(6));

            if (data.type === "column") {
              // Initialize the column with empty results
              newColumn = {
                id: data.columnId,
                projectId,
                name: data.name,
                displayName: data.displayName,
                prompt: aiColumnPrompt.trim(),
                type: data.columnType,
                createdAt: Date.now(),
                results: new Map<number, { value: any; status: string }>(),
              };
              setAiColumns((prev) => [...prev, newColumn]);
              setShowAIColumnDialog(false);
              setAiColumnName("");
              setAiColumnPrompt("");
              setAiColumnType("string");
            } else if (data.type === "result") {
              // Update the column results
              setAiColumns((prev) =>
                prev.map((col) => {
                  if (col.id !== data.columnId) return col;
                  const newResults = new Map(col.results);
                  newResults.set(data.rowIndex, {
                    value: data.value,
                    status: data.status,
                  });
                  return { ...col, results: newResults };
                }),
              );
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error("AI Column error:", err);
      toast.error("Failed to create AI column");
    } finally {
      setAiColumnLoading(false);
    }
  };

  const removeAIColumn = async (columnId: string) => {
    try {
      await fetch(`/api/ai-columns?columnId=${columnId}`, { method: "DELETE" });
      setAiColumns((prev) => prev.filter((c) => c.id !== columnId));
    } catch {
      toast.error("Failed to delete column");
    }
  };

  useEffect(() => {
    if (status === "idle") {
      // Try loading existing results first, start enrichment only if none found
      loadExistingResults().then((loaded) => {
        if (!loaded) {
          startEnrichment();
        } else {
          // Also load AI columns for existing projects
          loadAIColumns();
        }
      });
    }
  }, [startEnrichment, loadExistingResults, loadAIColumns, status]); // Add proper dependencies

  const cancelEnrichment = async () => {
    if (sessionId) {
      try {
        await fetch(`/api/enrich?sessionId=${sessionId}`, {
          method: "DELETE",
        });
      } catch (error) {
        console.error("Failed to cancel enrichment:", error);
      }
      setStatus("cancelled");
      setCurrentRow(-1);
    }
  };

  // Re-run all enrichment from scratch
  const rerunAll = useCallback(() => {
    // Reset all state
    setResults(new Map());
    setCurrentRow(-1);
    setSessionId(null);
    setAgentMessages([]);
    setRowDataArrivalTime(new Map());
    setCellsShown(new Set());
    // Directly start enrichment (skip loadExistingResults)
    startEnrichment();
  }, [startEnrichment]);

  const retryFailedRows = useCallback(async () => {
    // Collect failed/error/partial row indices AND unprocessed rows
    const expectedFieldCount = fieldsProp.length;
    const failedIndices: number[] = [];
    rows.forEach((_, index) => {
      const result = results.get(index);
      if (!result || result.status === "error") {
        failedIndices.push(index);
      } else if (result.status === "completed") {
        // Also retry rows with very few enrichments (partial results)
        const enrichmentCount = Object.keys(result.enrichments || {}).length;
        if (expectedFieldCount > 0 && enrichmentCount < expectedFieldCount * 0.3) {
          failedIndices.push(index);
        }
      }
    });

    if (failedIndices.length === 0) {
      toast.info("No failed rows to retry");
      return;
    }

    setStatus("processing");
    toast.info(`Retrying ${failedIndices.length} incomplete rows...`);

    try {
      const firecrawlApiKey = safeLocalStorage.getItem("firecrawl_api_key");
      const openaiApiKey = safeLocalStorage.getItem("openai_api_key");
      const serperApiKey = safeLocalStorage.getItem("serper_api_key");

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-use-agents": "true",
      };
      if (firecrawlApiKey) headers["X-Firecrawl-API-Key"] = firecrawlApiKey;
      if (openaiApiKey) headers["X-OpenAI-API-Key"] = openaiApiKey;
      if (serperApiKey) headers["X-Serper-API-Key"] = serperApiKey;

      // Send only the failed rows, keep mapping to original indices
      const failedRows = failedIndices.map((i) => rows[i]);
      // Map from retry index (0, 1, 2...) back to original row index
      const retryIndexToOriginal = new Map<number, number>();
      failedIndices.forEach((originalIndex, retryIndex) => {
        retryIndexToOriginal.set(retryIndex, originalIndex);
      });

      const response = await fetch("/api/enrich", {
        method: "POST",
        headers,
        body: JSON.stringify({
          rows: failedRows,
          fields: fieldsProp,
          emailColumn,
          useAgents: true,
          useV2Architecture: true,
          projectId,
          enrichmentMode,
          ...(pipelineConfig && { pipelineConfig }),
        }),
      });

      if (!response.ok) throw new Error("Failed to start retry");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.substring(6));

            if (data.type === "result" && data.result) {
              // Map retry rowIndex back to original index
              const originalIndex = retryIndexToOriginal.get(data.result.rowIndex) ?? data.result.rowIndex;
              setResults((prev) => {
                const newResults = new Map(prev);
                newResults.set(originalIndex, {
                  rowIndex: originalIndex,
                  originalData: rows[originalIndex],
                  enrichments: data.result.enrichments || {},
                  status: data.result.status,
                  error: data.result.error,
                });
                return newResults;
              });
              // Track animation
              setRowDataArrivalTime((prevTime) => {
                const newMap = new Map(prevTime);
                newMap.set(originalIndex, Date.now());
                return newMap;
              });
            } else if (data.type === "complete") {
              setStatus("completed");
            } else if (data.type === "agent_progress") {
              setAgentMessages((prev) => [
                ...prev,
                {
                  id: `${Date.now()}-${Math.random()}`,
                  message: data.message,
                  type: data.messageType,
                  timestamp: Date.now(),
                  rowIndex: retryIndexToOriginal.get(data.rowIndex) ?? data.rowIndex,
                  sourceUrl: data.sourceUrl,
                },
              ].slice(-500));
            }
          } catch {}
        }
      }

      setStatus("completed");
      toast.success("Retry complete!");
    } catch (error) {
      console.error("Retry error:", error);
      setStatus("completed");
      toast.error("Retry failed");
    }
  }, [results, rows, fieldsProp, emailColumn, projectId, enrichmentMode, pipelineConfig]);

  const downloadCSV = () => {
    // Build headers
    const headers = [
      effectiveEmailColumn || "email",
      ...fields.map((f) => f.displayName),
      ...fields.map((f) => `${f.displayName}_confidence`),
      ...fields.map((f) => `${f.displayName}_source`),
      ...aiColumns.map((col) => `AI: ${col.displayName}`),
    ];

    const csvRows = [headers.map((h) => `"${h}"`).join(",")];

    rows.forEach((row, index) => {
      const result = results.get(index);
      const values: string[] = [];

      // Add email
      const email = effectiveEmailColumn ? row[effectiveEmailColumn] : Object.values(row)[0];
      values.push(`"${email || ""}"`);

      // Add field values
      fields.forEach((field) => {
        const enrichment = result?.enrichments[field.name];
        const value = enrichment?.value;
        if (value === undefined || value === null) {
          values.push("");
        } else if (Array.isArray(value)) {
          values.push(`"${value.join("; ")}"`);
        } else if (
          typeof value === "string" &&
          (value.includes(",") || value.includes('"') || value.includes("\n"))
        ) {
          values.push(`"${value.replace(/"/g, '""')}"`);
        } else {
          values.push(String(value));
        }
      });

      // Add confidence scores
      fields.forEach((field) => {
        const enrichment = result?.enrichments[field.name];
        values.push(
          enrichment?.confidence ? enrichment.confidence.toFixed(2) : "",
        );
      });

      // Add sources
      fields.forEach((field) => {
        const enrichment = result?.enrichments[field.name];
        if (enrichment?.sourceContext && enrichment.sourceContext.length > 0) {
          const urls = enrichment.sourceContext.map((s) => s.url).join("; ");
          values.push(`"${urls}"`);
        } else if (enrichment?.source) {
          values.push(`"${enrichment.source}"`);
        } else {
          values.push("");
        }
      });

      // Add AI column values
      aiColumns.forEach((col) => {
        const cellResult = col.results.get(index);
        if (!cellResult || cellResult.value === null || cellResult.value === undefined) {
          values.push("");
        } else if (typeof cellResult.value === "boolean") {
          values.push(cellResult.value ? "true" : "false");
        } else {
          const str = String(cellResult.value);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            values.push(`"${str.replace(/"/g, '""')}"`);
          } else {
            values.push(str);
          }
        }
      });

      csvRows.push(values.join(","));
    });

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enriched_data_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        totalRows: rows.length,
        processedRows: results.size,
        fields: fields.map((f) => ({
          name: f.name,
          displayName: f.displayName,
          type: f.type,
        })),
        aiColumns: aiColumns.map((c) => ({
          name: c.name,
          displayName: c.displayName,
          type: c.type,
          prompt: c.prompt,
        })),
        status: status,
      },
      data: rows.map((row, index) => {
        const result = results.get(index);
        const email = effectiveEmailColumn ? row[effectiveEmailColumn] : Object.values(row)[0];

        const enrichedRow: Record<string, unknown> = {
          _index: index,
          _email: email,
          _original: row,
          _status: result ? "enriched" : "pending",
        };

        if (result) {
          fields.forEach((field) => {
            const enrichment = result.enrichments[field.name];
            if (enrichment) {
              enrichedRow[field.name] = {
                value: enrichment.value,
                confidence: enrichment.confidence,
                sources:
                  enrichment.sourceContext?.map((s) => s.url) ||
                  (enrichment.source ? enrichment.source.split(", ") : []),
              };
            }
          });
        }

        // Add AI column values
        aiColumns.forEach((col) => {
          const cellResult = col.results.get(index);
          if (cellResult && cellResult.value !== null && cellResult.value !== undefined) {
            enrichedRow[`ai_${col.name}`] = cellResult.value;
          }
        });

        return enrichedRow;
      }),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enriched_data_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSkippedEmails = () => {
    // Get all skipped rows
    const skippedRows = rows.filter((_, index) => {
      const result = results.get(index);
      return result?.status === "skipped";
    });

    if (skippedRows.length === 0) {
      return;
    }

    // Create CSV header
    const headers = Object.keys(skippedRows[0]);
    const csvRows = [headers.join(",")];

    // Add skipped rows with skip reason
    skippedRows.forEach((row, index) => {
      const originalIndex = rows.findIndex((r) => r === row);
      const result = results.get(originalIndex);
      const values = headers.map((header) => {
        const value = row[header];
        // Escape quotes and wrap in quotes if necessary
        if (
          typeof value === "string" &&
          (value.includes(",") || value.includes('"') || value.includes("\n"))
        ) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value || "";
      });

      // Add skip reason as last column
      if (index === 0) {
        csvRows[0] += ",Skip Reason";
      }
      values.push(result?.error || "Personal email provider");

      csvRows.push(values.join(","));
    });

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skipped_emails_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const copyRowData = (rowIndex: number) => {
    const result = results.get(rowIndex);
    const row = rows[rowIndex];
    if (!result || !row) return;

    // Format data nicely for Google Docs
    const emailValue = effectiveEmailColumn ? row[effectiveEmailColumn] : "";
    let formattedData = `Email: ${emailValue}\n\n`;

    fields.forEach((field) => {
      const enrichment = result.enrichments[field.name];
      const value = enrichment?.value;

      // Format the field name and value
      formattedData += `${field.displayName}: `;

      if (value === undefined || value === null || value === "") {
        formattedData += "Not found";
      } else if (Array.isArray(value)) {
        formattedData += value.join(", ");
      } else if (typeof value === "boolean") {
        formattedData += value ? "Yes" : "No";
      } else {
        formattedData += String(value);
      }

      formattedData += "\n\n";
    });

    // Include AI column data
    aiColumns.forEach((col) => {
      const cellResult = col.results.get(rowIndex);
      if (cellResult && cellResult.value !== null && cellResult.value !== undefined) {
        formattedData += `${col.displayName}: `;
        if (typeof cellResult.value === "boolean") {
          formattedData += cellResult.value ? "Yes" : "No";
        } else {
          formattedData += String(cellResult.value);
        }
        formattedData += "\n\n";
      }
    });

    copyToClipboard(formattedData.trim());

    // Show copied feedback
    setCopiedRow(rowIndex);
    toast.success("Row data copied to clipboard!");
    setTimeout(() => setCopiedRow(null), 2000);
  };

  const openDetailSidebar = (rowIndex: number) => {
    const row = rows[rowIndex];
    const result = results.get(rowIndex);
    setSelectedRow({ isOpen: true, row, result, index: rowIndex });
  };

  // Row management: toggle row checkbox
  const toggleRowCheck = useCallback((rowIndex: number) => {
    setCheckedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  }, []);

  // Row management: toggle all rows
  const toggleAllRows = useCallback(() => {
    setCheckedRows(prev => {
      if (prev.size === rows.length) {
        return new Set();
      }
      return new Set(rows.map((_, i) => i));
    });
  }, [rows]);

  // Row management: delete selected rows' enrichment results
  const deleteSelectedRows = useCallback(() => {
    if (checkedRows.size === 0) return;
    setResults(prev => {
      const next = new Map(prev);
      checkedRows.forEach(index => next.delete(index));
      return next;
    });
    toast.success(`Cleared ${checkedRows.size} row results`);
    setCheckedRows(new Set());
  }, [checkedRows]);

  // Row management: commit inline edit
  const commitCellEdit = useCallback(() => {
    if (!editingCell) return;
    const { rowIndex, fieldName, value } = editingCell;

    setResults(prev => {
      const next = new Map(prev);
      const result = next.get(rowIndex);
      if (result) {
        const field = fields.find(f => f.name === fieldName);
        let parsedValue: string | number | boolean | string[] = value;
        if (field?.type === 'number') {
          parsedValue = Number(value) || 0;
        } else if (field?.type === 'boolean') {
          parsedValue = value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
        }

        const updatedResult = {
          ...result,
          enrichments: {
            ...result.enrichments,
            [fieldName]: {
              ...(result.enrichments[fieldName] || { field: fieldName, confidence: 1, source: 'Manual edit' }),
              value: parsedValue,
              source: 'Manual edit',
            },
          },
        };
        next.set(rowIndex, updatedResult);
      }
      return next;
    });
    setEditingCell(null);
  }, [editingCell, fields]);

  const handleChatMessage = async (message: string) => {
    const queryId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setChatQueryId(queryId);
    setIsChatProcessing(true);

    // Add user message
    setAgentMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        message,
        type: "user",
        timestamp: Date.now(),
      },
    ]);

    try {
      const firecrawlApiKey = safeLocalStorage.getItem("firecrawl_api_key");
      const openaiApiKey = safeLocalStorage.getItem("openai_api_key");
      const serperApiKey = safeLocalStorage.getItem("serper_api_key");

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (firecrawlApiKey) headers["X-Firecrawl-API-Key"] = firecrawlApiKey;
      if (openaiApiKey) headers["X-OpenAI-API-Key"] = openaiApiKey;
      if (serperApiKey) headers["X-Serper-API-Key"] = serperApiKey;

      // Get conversation history (last 10 messages)
      const conversationHistory = agentMessages
        .filter(msg => msg.type === 'user' || msg.type === 'assistant')
        .slice(-10)
        .map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.message
        }));

      // Build full table context with enriched data as formatted string
      const tableDataRows = rows.map((row, index) => {
        const result = results.get(index);
        if (!result || result.status === 'pending') return null;

        const enrichedData: Record<string, any> = {};
        if (result?.enrichments) {
          Object.entries(result.enrichments).forEach(([key, enrichment]) => {
            if (enrichment.value) {
              enrichedData[key] = enrichment.value;
            }
          });
        }

        // Include AI column data
        aiColumns.forEach((col) => {
          const cellResult = col.results.get(index);
          if (cellResult && cellResult.value !== null && cellResult.value !== undefined) {
            enrichedData[`AI:${col.displayName}`] = cellResult.value;
          }
        });

        const email = effectiveEmailColumn ? row[effectiveEmailColumn] : Object.values(row)[0];
        const dataPoints = Object.entries(enrichedData)
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
          .join(', ');

        return `Row ${index + 1} (${email}): ${dataPoints || 'No data enriched yet'}`;
      }).filter(Boolean);

      const tableDataString = tableDataRows.length > 0
        ? `Enriched Data Table:\n${tableDataRows.join('\n')}\n\nTotal: ${tableDataRows.length} rows with data`
        : '';

      const response = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          question: message,
          context: {
            emailColumn,
            fields: fields.map((f) => ({ name: f.name, displayName: f.displayName })),
            aiColumns: aiColumns.map((c) => ({ name: c.name, displayName: c.displayName, type: c.type })),
            totalRows: rows.length,
            processedRows: results.size,
            tableData: tableDataString, // Include formatted table data as string
          },
          conversationHistory,
          sessionId: queryId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.substring(6));

              if (data.type === "status") {
                setAgentMessages((prev) => [
                  ...prev,
                  {
                    id: `status-${Date.now()}-${Math.random()}`,
                    message: data.message,
                    type: "info",
                    timestamp: Date.now(),
                    sourceUrl: data.source?.url,
                  },
                ]);
              } else if (data.type === "response") {
                setAgentMessages((prev) => [
                  ...prev,
                  {
                    id: `assistant-${Date.now()}`,
                    message: data.message,
                    type: "assistant",
                    timestamp: Date.now(),
                  },
                ]);
              } else if (data.type === "error") {
                setAgentMessages((prev) => [
                  ...prev,
                  {
                    id: `error-${Date.now()}`,
                    message: data.message,
                    type: "warning",
                    timestamp: Date.now(),
                  },
                ]);
              }
            } catch {
              // Ignore parsing errors
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setAgentMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          message: "Failed to process your question. Please try again.",
          type: "warning",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsChatProcessing(false);
      setChatQueryId(null);
    }
  };

  const handleStopQuery = async () => {
    if (chatQueryId) {
      try {
        await fetch(`/api/chat?queryId=${chatQueryId}`, {
          method: "DELETE",
        });
      } catch (error) {
        console.error("Failed to stop query:", error);
      }
      setIsChatProcessing(false);
      setChatQueryId(null);
    }
  };

  const toggleRowExpansion = (rowIndex: number) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowIndex)) {
        newSet.delete(rowIndex);
      } else {
        newSet.add(rowIndex);
      }
      return newSet;
    });
  };

  // Auto-expand currently processing row
  useEffect(() => {
    if (currentRow >= 0 && status === "processing") {
      setExpandedRows(prev => {
        const newSet = new Set(prev);
        newSet.add(currentRow);
        return newSet;
      });
    }
  }, [currentRow, status]);

  // Auto-collapse completed rows after 2 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setExpandedRows(prev => {
        const newSet = new Set(prev);
        // Keep only the currently processing row expanded
        Array.from(newSet).forEach(rowIndex => {
          const result = results.get(rowIndex);
          if (result && result.status !== 'processing' && rowIndex !== currentRow) {
            newSet.delete(rowIndex);
          }
        });
        return newSet;
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [results, currentRow]);

  // Sorting and filtering
  const handleSort = useCallback((key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null; // third click clears sort
      }
      return { key, direction: 'asc' };
    });
  }, []);

  const getRowSortValue = useCallback((index: number, key: string): string | number => {
    const row = rows[index];
    const result = results.get(index);

    if (key === 'email') {
      return effectiveEmailColumn ? (row[effectiveEmailColumn] || '').toLowerCase() : '';
    }
    if (key === 'status') {
      return result?.status || 'pending';
    }
    if (key.startsWith('ai:')) {
      const colId = key.slice(3);
      const col = aiColumns.find(c => c.id === colId);
      if (col) {
        const cellResult = col.results.get(index);
        return cellResult?.value != null ? String(cellResult.value).toLowerCase() : '';
      }
      return '';
    }
    // Enrichment field
    const enrichment = result?.enrichments[key];
    if (enrichment?.value != null) {
      if (typeof enrichment.value === 'number') return enrichment.value;
      return String(enrichment.value).toLowerCase();
    }
    return '';
  }, [rows, results, effectiveEmailColumn, aiColumns]);

  const sortedAndFilteredIndices = (() => {
    let indices = rows.map((_, i) => i);

    // Filter
    if (filterText) {
      const lower = filterText.toLowerCase();
      indices = indices.filter(i => {
        const row = rows[i];
        const result = results.get(i);
        // Search email
        const email = effectiveEmailColumn ? row[effectiveEmailColumn] : Object.values(row)[0];
        if (email && email.toLowerCase().includes(lower)) return true;
        // Search all original data
        if (Object.values(row).some(v => v && v.toLowerCase().includes(lower))) return true;
        // Search enrichment values
        if (result?.enrichments) {
          for (const enrichment of Object.values(result.enrichments)) {
            if (enrichment.value != null && String(enrichment.value).toLowerCase().includes(lower)) return true;
          }
        }
        // Search AI column values
        for (const col of aiColumns) {
          const cellResult = col.results.get(i);
          if (cellResult?.value != null && String(cellResult.value).toLowerCase().includes(lower)) return true;
        }
        return false;
      });
    }

    // Sort
    if (sortConfig) {
      indices.sort((a, b) => {
        const va = getRowSortValue(a, sortConfig.key);
        const vb = getRowSortValue(b, sortConfig.key);
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      });
    }

    return indices;
  })();

  return (
    <div className="flex h-full gap-0 relative px-4 sm:px-6 py-4">
      {/* Main Table - takes remaining space */}
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${isChatExpanded ? 'pr-[440px]' : 'pr-0'}`}>
        {/* Progress Header */}
        <Card className="p-4 rounded-md mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-label-medium text-foreground">
                {status === "processing"
                  ? "Enriching Data"
                  : status === "completed"
                    ? "Enrichment Complete"
                    : "Enrichment Cancelled"}
              </h3>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-body-small text-muted-foreground">
                  {results.size} of {rows.length} rows processed
                </span>
                {(() => {
                  const skippedCount = Array.from(results.values()).filter(
                    (r) => r.status === "skipped",
                  ).length;
                  if (skippedCount > 0) {
                    return (
                      <span className="text-body-small text-muted-foreground">
                        • {skippedCount} skipped
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {(status === "completed" ||
                status === "cancelled" ||
                (status === "processing" && results.size > 0)) && (
                <>
                  <button
                    onClick={downloadCSV}
                    className="rounded-6 px-8 py-4 gap-2 text-body-small text-foreground bg-accent hover:bg-accent/80 transition-colors flex items-center"
                  >
                    <Download style={{ width: '14px', height: '14px' }} />
                    CSV
                  </button>
                  <button
                    onClick={downloadJSON}
                    className="rounded-6 px-8 py-4 gap-2 text-body-small text-foreground bg-accent hover:bg-accent/80 transition-colors flex items-center"
                  >
                    <Download style={{ width: '14px', height: '14px' }} />
                    JSON
                  </button>
                  {onStartOutreach && projectId && status === "completed" && (
                    <button
                      onClick={() => onStartOutreach(projectId)}
                      className="rounded-6 px-8 py-4 gap-2 text-body-small text-white bg-orange-500 hover:bg-orange-600 transition-colors flex items-center"
                    >
                      <Mail style={{ width: '14px', height: '14px' }} />
                      Start Outreach
                    </button>
                  )}
                </>
              )}

              {/* Retry incomplete rows button (failed + unprocessed) */}
              {(status === "completed" || status === "cancelled") && (() => {
                const expectedFieldCount = fieldsProp.length;
                const incompleteCount = rows.filter((_, i) => {
                  const r = results.get(i);
                  if (!r || r.status === "error") return true;
                  if (r.status === "completed" && expectedFieldCount > 0) {
                    const count = Object.keys(r.enrichments || {}).length;
                    return count < expectedFieldCount * 0.3;
                  }
                  return false;
                }).length;
                return incompleteCount > 0 ? (
                  <button
                    onClick={retryFailedRows}
                    className="rounded-6 px-8 py-4 gap-2 text-body-small text-orange-600 dark:text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 transition-colors flex items-center"
                  >
                    <RefreshCw style={{ width: '14px', height: '14px' }} />
                    Retry Incomplete ({incompleteCount})
                  </button>
                ) : null;
              })()}

              {/* Re-run all button */}
              {(status === "completed" || status === "cancelled") && (
                <button
                  onClick={rerunAll}
                  className="rounded-6 px-8 py-4 gap-2 text-body-small text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-colors flex items-center"
                >
                  <RefreshCw style={{ width: '14px', height: '14px' }} />
                  Re-run All
                </button>
              )}

              {/* Delete selected rows */}
              {checkedRows.size > 0 && (
                <button
                  onClick={deleteSelectedRows}
                  className="rounded-6 px-8 py-4 gap-2 text-body-small text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors flex items-center"
                >
                  <Trash style={{ width: '14px', height: '14px' }} />
                  Clear {checkedRows.size} selected
                </button>
              )}

              {status === "processing" && (
                <button
                  onClick={cancelEnrichment}
                  className="rounded-6 px-8 py-4 gap-2 text-body-small text-foreground bg-accent hover:bg-accent/80 transition-colors flex items-center"
                >
                  <X style={{ width: '14px', height: '14px' }} />
                  Cancel
                </button>
              )}
            </div>
          </div>
        </Card>

        {/* Filter bar */}
        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search style={{ width: '14px', height: '14px' }} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="text"
              placeholder="Filter rows..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-body-small border border-border rounded-md bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
            />
            {filterText && (
              <button
                onClick={() => setFilterText("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
              >
                <X style={{ width: '12px', height: '12px' }} />
              </button>
            )}
          </div>
          {filterText && (
            <span className="text-body-small text-muted-foreground">
              {sortedAndFilteredIndices.length} of {rows.length} rows
            </span>
          )}
          <button
            onClick={() => setCellViewMode(cellViewMode === "compact" ? "expanded" : "compact")}
            className="flex items-center gap-1.5 px-3 py-2 text-body-small border border-border rounded-md bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ml-auto"
            title={cellViewMode === "compact" ? "Expand cells to show full content" : "Compact cells"}
          >
            {cellViewMode === "compact" ? (
              <>
                <Maximize2 style={{ width: '13px', height: '13px' }} />
                Expand cells
              </>
            ) : (
              <>
                <Minimize2 style={{ width: '13px', height: '13px' }} />
                Compact cells
              </>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-auto scrollbar-hide">
          <div className="overflow-hidden rounded-md shadow-sm border border-border">
            <div className="overflow-x-auto scrollbar-hide bg-card">
              <table className={`min-w-full relative ${cellViewMode === "compact" ? "table-fixed" : "table-auto"}`}>
                <thead>
                  <tr className="">
                    <th className="sticky left-0 z-10 bg-card px-2 py-4 w-10 border-r border-border">
                      <input
                        type="checkbox"
                        checked={checkedRows.size === rows.length && rows.length > 0}
                        onChange={toggleAllRows}
                        className="w-4 h-4 rounded border-border text-foreground focus:ring-ring cursor-pointer"
                      />
                    </th>
                    <th
                      className="sticky left-10 z-10 bg-card px-6 py-4 text-left text-label-medium text-foreground border-r-2 border-border w-64 cursor-pointer select-none hover:bg-accent transition-colors"
                      onClick={() => handleSort('email')}
                    >
                      <div className="flex items-center gap-1">
                        {pipelineConfig?.identifierColumn || emailColumn || "Email"}
                        {sortConfig?.key === 'email' && (
                          sortConfig.direction === 'asc'
                            ? <ArrowUp style={{ width: '12px', height: '12px' }} className="text-muted-foreground" />
                            : <ArrowDown style={{ width: '12px', height: '12px' }} className="text-muted-foreground" />
                        )}
                      </div>
                    </th>
                    {fields.map((field) => (
                      <th
                        key={field.name}
                        className="px-6 py-4 text-left text-label-medium text-foreground bg-accent w-80 cursor-pointer select-none hover:bg-accent/80 transition-colors"
                        onClick={() => handleSort(field.name)}
                      >
                        <div className="flex items-center gap-1">
                          {field.displayName}
                          {sortConfig?.key === field.name && (
                            sortConfig.direction === 'asc'
                              ? <ArrowUp style={{ width: '12px', height: '12px' }} className="text-muted-foreground" />
                              : <ArrowDown style={{ width: '12px', height: '12px' }} className="text-muted-foreground" />
                          )}
                        </div>
                      </th>
                    ))}
                    {/* AI Columns */}
                    {aiColumns.map((col) => (
                      <th
                        key={col.id}
                        className="px-6 py-4 text-left text-label-medium text-foreground bg-purple-950/30 w-80 group/ai-col cursor-pointer select-none hover:bg-purple-950/40 transition-colors"
                        onClick={() => handleSort(`ai:${col.id}`)}
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles style={{ width: '14px', height: '14px' }} className="text-purple-400" />
                          <span>{col.displayName}</span>
                          {sortConfig?.key === `ai:${col.id}` && (
                            sortConfig.direction === 'asc'
                              ? <ArrowUp style={{ width: '12px', height: '12px' }} className="text-purple-400" />
                              : <ArrowDown style={{ width: '12px', height: '12px' }} className="text-purple-400" />
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); removeAIColumn(col.id); }}
                            className="opacity-0 group-hover/ai-col:opacity-100 p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-all"
                          >
                            <Trash2 style={{ width: '12px', height: '12px' }} />
                          </button>
                        </div>
                      </th>
                    ))}
                    {/* Add AI Column button */}
                    {projectId && status === "completed" && (
                      <th className="px-4 py-4 bg-accent w-16">
                        <button
                          onClick={() => setShowAIColumnDialog(true)}
                          className="flex items-center justify-center w-8 h-8 rounded-lg border-2 border-dashed border-border hover:border-purple-400 hover:bg-purple-950/30 text-muted-foreground hover:text-purple-400 transition-all"
                          title="Add AI Column"
                        >
                          <Plus style={{ width: '16px', height: '16px' }} />
                        </button>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedAndFilteredIndices.map((index) => {
                const row = rows[index];
                const result = results.get(index);
                const isProcessing =
                  currentRow === index && status === "processing";

                return (
                  <tr
                    key={index}
                    className={`
                  ${
                    isProcessing
                      ? "animate-processing-row"
                      : index % 2 === 0
                        ? "bg-card"
                        : "bg-accent/30"
                  }
                  hover:bg-accent/50 transition-all duration-300 group border border-border
                `}
                  >
                    <td
                      className={`
                    sticky left-0 z-10 px-2 py-4 w-10
                    ${isProcessing ? "bg-accent " : "bg-card"}
                    border-r border-border
                  `}
                    >
                      <input
                        type="checkbox"
                        checked={checkedRows.has(index)}
                        onChange={() => toggleRowCheck(index)}
                        className="w-4 h-4 rounded border-border text-foreground focus:ring-ring cursor-pointer"
                      />
                    </td>
                    <td
                      className={`
                    sticky left-10 z-10 px-6 py-4 text-body-small
                    ${isProcessing ? "bg-accent " : "bg-card"}
                    border-r-2 border-border
                  `}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 relative">
                          <div className="flex items-center gap-1 relative z-10">
                            <div className="text-foreground text-body-medium truncate max-w-[180px]">
                              {effectiveEmailColumn
                                ? row[effectiveEmailColumn]
                                : Object.values(row)[0]}
                            </div>
                            {/* Show additional columns if CSV has many columns */}
                            {Object.keys(row).length > fields.length + 1 && (
                              <div className="flex items-center gap-1 text-body-small text-muted-foreground">
                                {Object.keys(row)
                                  .slice(1, 3)
                                  .map((key, idx) => (
                                    <span
                                      key={idx}
                                      className="truncate max-w-[60px]"
                                      title={row[key]}
                                    >
                                      {idx > 0 && ", "}
                                      {row[key]}
                                    </span>
                                  ))}
                                {Object.keys(row).length > 3 && (
                                  <span className="text-muted-foreground">
                                    +{Object.keys(row).length - 3} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-body-small">
                          {result?.status !== "pending" && (
                            <button
                              onClick={() => openDetailSidebar(index)}
                              className="text-muted-foreground hover:text-foreground hover:underline"
                            >
                              View details →
                            </button>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Check if this row is skipped and render a single merged cell */}
                    {result?.status === "skipped" ? (
                      <td
                        colSpan={fields.length}
                        className="p-12 text-body-small border-l border-border bg-accent/30"
                      >
                        <div className="flex flex-col items-start gap-2">
                          <span className="inline-flex items-center px-4 py-2 bg-accent text-muted-foreground rounded-full text-body-x-small">
                            Skipped
                          </span>
                          <span className="text-body-x-small text-muted-foreground">
                            {result.error || "Personal email provider"}
                          </span>
                        </div>
                      </td>
                    ) : (
                      fields.map((field, fieldIndex) => {
                        const enrichment = result?.enrichments[field.name];
                        const cellKey = `${index}-${field.name}`;

                        // Check if this cell should be shown
                        const isCellShown = cellsShown.has(cellKey);
                        const rowArrivalTime = rowDataArrivalTime.get(index);
                        const cellDelay = getCellAnimationDelay(
                          index,
                          fieldIndex,
                        );
                        const shouldAnimate =
                          rowArrivalTime &&
                          !isCellShown &&
                          Date.now() - rowArrivalTime < 2500;
                        const shouldShowData =
                          isCellShown ||
                          (rowArrivalTime &&
                            Date.now() - rowArrivalTime > cellDelay);

                        return (
                          <td
                            key={field.name}
                            className="px-6 py-4 text-body-small relative border-l border-border group/cell"
                            onDoubleClick={() => {
                              if (result?.status === 'completed' && enrichment?.value != null) {
                                setEditingCell({
                                  rowIndex: index,
                                  fieldName: field.name,
                                  value: Array.isArray(enrichment.value) ? enrichment.value.join(', ') : String(enrichment.value),
                                });
                              }
                            }}
                          >
                            {editingCell?.rowIndex === index && editingCell?.fieldName === field.name ? (
                              <input
                                autoFocus
                                type="text"
                                value={editingCell.value}
                                onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                onBlur={commitCellEdit}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitCellEdit();
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                className="w-full px-2 py-1 text-body-small border border-primary rounded bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            ) : !result || result?.status === "pending" ? (
                              <div className="animate-slow-pulse">
                                <div className="h-5 bg-gradient-to-r from-muted to-accent rounded-full w-3/4"></div>
                              </div>
                            ) : !shouldShowData && shouldAnimate ? (
                              <div className="animate-slow-pulse">
                                <div className="h-5 bg-gradient-to-r from-muted to-accent rounded-full w-3/4"></div>
                              </div>
                            ) : result?.status === "error" ? (
                              <span className="inline-flex items-center px-2 py-1 bg-red-500/20 text-red-600 dark:text-red-400 rounded-full text-body-x-small">
                                Error
                              </span>
                            ) : result?.status === 'completed' && (!enrichment ||
                              enrichment.value === null ||
                              enrichment.value === undefined ||
                              enrichment.value === "") ? (
                              <div
                                className={
                                  shouldAnimate && !isCellShown
                                    ? "animate-in fade-in slide-in-from-bottom-2"
                                    : ""
                                }
                                style={
                                  shouldAnimate && !isCellShown
                                    ? {
                                        animationDuration: "500ms",
                                        animationDelay: `${cellDelay}ms`,
                                        animationFillMode: "both",
                                        animationTimingFunction:
                                          "cubic-bezier(0.4, 0, 0.2, 1)",
                                      }
                                    : {}
                                }
                              >
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <X style={{ width: '20px', height: '20px', minWidth: '20px', minHeight: '20px' }} />
                                </span>
                              </div>
                            ) : !enrichment ||
                              enrichment.value === null ||
                              enrichment.value === undefined ||
                              enrichment.value === "" ? (
                              <div className="animate-slow-pulse">
                                <div className="h-5 bg-gradient-to-r from-muted to-accent rounded-full w-3/4"></div>
                              </div>
                            ) : (
                              <div
                                className={
                                  shouldAnimate && !isCellShown
                                    ? "animate-in fade-in slide-in-from-bottom-2"
                                    : ""
                                }
                                style={
                                  shouldAnimate && !isCellShown
                                    ? {
                                        animationDuration: "500ms",
                                        animationDelay: `${cellDelay}ms`,
                                        animationFillMode: "both",
                                        animationTimingFunction:
                                          "cubic-bezier(0.4, 0, 0.2, 1)",
                                      }
                                    : {}
                                }
                              >
                                <div className="flex flex-col gap-1">
                                  <div className="text-foreground">
                                    {field.type === "boolean" ? (
                                      <span
                                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${
                                          enrichment.value === true ||
                                          enrichment.value === "true" ||
                                          enrichment.value === "Yes"
                                            ? "bg-green-500/20 text-green-600 dark:text-green-400"
                                            : "bg-red-500/20 text-red-600 dark:text-red-400"
                                        }`}
                                      >
                                        {enrichment.value === true ||
                                        enrichment.value === "true" ||
                                        enrichment.value === "Yes"
                                          ? "✓"
                                          : "✗"}
                                      </span>
                                    ) : field.type === "array" &&
                                      Array.isArray(enrichment.value) ? (
                                      <div className="space-y-1">
                                        {enrichment.value
                                          .slice(0, 2)
                                          .map((item, i) => (
                                            <span
                                              key={i}
                                              className="inline-block px-2 py-1 bg-accent text-foreground rounded-full text-body-x-small mr-1"
                                            >
                                              {item}
                                            </span>
                                          ))}
                                        {enrichment.value.length > 2 && (
                                          <span className="text-body-x-small text-muted-foreground">
                                            {" "}
                                            +{enrichment.value.length - 2} more
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <div
                                        className={cellViewMode === "compact"
                                          ? "truncate max-w-xs cursor-text"
                                          : "whitespace-pre-wrap break-words cursor-text max-w-md"
                                        }
                                        title={cellViewMode === "compact" ? `${String(enrichment.value)} (double-click to edit)` : undefined}
                                        onClick={(e) => {
                                          if (cellViewMode === "compact" && String(enrichment.value).length > 40) {
                                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                                            setExpandedCell({
                                              rowIndex: index,
                                              fieldName: field.name,
                                              value: String(enrichment.value),
                                              rect: { top: rect.bottom, left: rect.left, width: rect.width },
                                            });
                                          }
                                        }}
                                      >
                                        {enrichment.value || "-"}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                        );
                      })
                    )}
                    {/* AI Column cells */}
                    {aiColumns.map((col) => {
                      const cellResult = col.results.get(index);
                      return (
                        <td
                          key={col.id}
                          className="px-6 py-4 text-body-small relative border-l border-purple-900/20 bg-purple-950/10"
                        >
                          {!cellResult || cellResult.status === "pending" ? (
                            <div className="animate-slow-pulse">
                              <div className="h-5 bg-gradient-to-r from-purple-950/30 to-purple-900/20 rounded-full w-3/4"></div>
                            </div>
                          ) : cellResult.status === "error" ? (
                            <span className="inline-flex items-center px-2 py-1 bg-red-500/20 text-red-600 dark:text-red-400 rounded-full text-body-x-small">
                              Error
                            </span>
                          ) : col.type === "boolean" ? (
                            <span
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${
                                cellResult.value === true || cellResult.value === "true"
                                  ? "bg-green-500/20 text-green-600 dark:text-green-400"
                                  : "bg-red-500/20 text-red-600 dark:text-red-400"
                              }`}
                            >
                              {cellResult.value === true || cellResult.value === "true" ? "✓" : "✗"}
                            </span>
                          ) : col.type === "number" ? (
                            <span className="text-foreground font-mono">
                              {cellResult.value}
                            </span>
                          ) : (
                            <div
                              className={cellViewMode === "compact"
                                ? "truncate max-w-xs text-foreground"
                                : "whitespace-pre-wrap break-words text-foreground max-w-md"
                              }
                              title={cellViewMode === "compact" ? String(cellResult.value || "") : undefined}
                            >
                              {cellResult.value || "-"}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    {/* Empty cell for "+" column */}
                    {projectId && status === "completed" && (
                      <td className="px-4 py-4 border-l border-border" />
                    )}
                  </tr>
                );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded cell popover */}
      {expandedCell && (
        <div
          className="fixed inset-0 z-[100]"
          onClick={() => setExpandedCell(null)}
        >
          <div
            className="absolute bg-card border border-border rounded-lg shadow-xl p-4 max-w-lg max-h-64 overflow-y-auto z-[101]"
            style={{
              top: Math.min(expandedCell.rect.top + 4, window.innerHeight - 280),
              left: Math.min(expandedCell.rect.left, window.innerWidth - 500),
              minWidth: Math.max(expandedCell.rect.width, 300),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-body-small text-muted-foreground font-medium">
                {fields.find(f => f.name === expandedCell.fieldName)?.displayName || expandedCell.fieldName}
              </span>
              <button
                onClick={() => setExpandedCell(null)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X style={{ width: '14px', height: '14px' }} />
              </button>
            </div>
            <p className="text-body-small text-foreground whitespace-pre-wrap break-words leading-relaxed">
              {expandedCell.value}
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(expandedCell.value);
                toast.success("Copied to clipboard");
              }}
              className="mt-3 flex items-center gap-1.5 text-body-x-small text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy style={{ width: '12px', height: '12px' }} />
              Copy
            </button>
          </div>
        </div>
      )}

      <Dialog
        open={selectedRow.isOpen}
        onOpenChange={(open) =>
          setSelectedRow({ ...selectedRow, isOpen: open })
        }
      >
        <DialogContent className="bg-card max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedRow.row && (
            <>
              <DialogHeader className="pb-6 border-b border-border">
                <DialogTitle className="text-title-h3 text-foreground mb-4">
                  {effectiveEmailColumn
                    ? selectedRow.row[effectiveEmailColumn]
                    : Object.values(selectedRow.row)[0]}
                </DialogTitle>

                {/* Status Badge */}
                <div className="flex items-center gap-3 mb-4">
                  {selectedRow.result?.status === "completed" ? (
                    <Badge className="bg-accent text-foreground/80 border-border">
                      Enriched
                    </Badge>
                  ) : selectedRow.result?.status === "skipped" ? (
                    <Badge className="bg-accent text-foreground/80 border-border">
                      Skipped
                    </Badge>
                  ) : selectedRow.result?.status === "error" ? (
                    <Badge className="bg-accent text-foreground/80 border-border">
                      Error
                    </Badge>
                  ) : (
                    <Badge className="bg-accent text-foreground/80 border-border">
                      Processing
                    </Badge>
                  )}
                  <span className="text-body-small text-muted-foreground">
                    Row {selectedRow.index + 1} of {rows.length}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3">
                  {selectedRow.result && (
                    <>
                      {emailColumn && !pipelineConfig && selectedRow.row[emailColumn] && (
                        <a
                          href={`mailto:${selectedRow.row[emailColumn]}`}
                          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 text-foreground/80 rounded-lg transition-all text-body-medium"
                        >
                          Send Email
                        </a>
                      )}
                    </>
                  )}
                </div>
              </DialogHeader>

              <div className="mt-6 space-y-6">
                {/* Activity Log for this row */}
                {selectedRow.result && agentMessages.filter(msg => msg.rowIndex === selectedRow.index).length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-label-medium text-foreground font-semibold">
                        Activity Log
                      </h3>
                    </div>
                    <Card className="p-4 bg-accent/50 border-border rounded-md max-h-[200px] overflow-y-auto scrollbar-hide">
                      <div className="space-y-2">
                        {agentMessages
                          .filter(msg => msg.rowIndex === selectedRow.index)
                          .map((msg, idx) => {
                            return (
                              <div key={idx} className="flex items-start gap-2 text-body-small">
                                <span className="text-foreground/80 leading-relaxed">{msg.message}</span>
                              </div>
                            );
                          })
                        }
                      </div>
                    </Card>
                  </div>
                )}

                {/* Enriched Fields */}
                {selectedRow.result && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="h-px flex-1 bg-border" />
                      <h3 className="text-label-medium text-foreground font-semibold">
                        Enriched Data
                      </h3>
                      <div className="h-px flex-1 bg-border" />
                    </div>

                    <div className="space-y-3">
                      {fields.map((field) => {
                        const enrichment =
                          selectedRow.result?.enrichments[field.name];
                        if (!enrichment && enrichment !== null) return null;

                        return (
                          <Card
                            key={field.name}
                            className="p-4 bg-accent border-border rounded-md"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <Label className="text-label-medium text-muted-foreground">
                                {field.displayName}
                              </Label>
                            </div>

                            <div className="text-foreground">
                              {!enrichment ||
                              enrichment.value === null ||
                              enrichment.value === undefined ||
                              enrichment.value === "" ? (
                                <div className="flex items-center gap-2 text-muted-foreground/60 py-2">
                                  <X style={{ width: '20px', height: '20px', minWidth: '20px', minHeight: '20px' }} />
                                </div>
                              ) : field.type === "array" &&
                                Array.isArray(enrichment.value) ? (
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {enrichment.value.map((item, i) => (
                                    <Badge
                                      key={i}
                                      variant="secondary"
                                      className="bg-accent text-foreground/80 border-border"
                                    >
                                      {item}
                                    </Badge>
                                  ))}
                                </div>
                              ) : field.type === "boolean" ? (
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                      enrichment.value === true ||
                                      enrichment.value === "true" ||
                                      enrichment.value === "Yes"
                                        ? "bg-green-500/20"
                                        : "bg-red-500/20"
                                    }`}
                                  >
                                    {enrichment.value === true ||
                                    enrichment.value === "true" ||
                                    enrichment.value === "Yes" ? (
                                      <Check style={{ width: '20px', height: '20px', minWidth: '20px', minHeight: '20px' }} className="text-green-600 dark:text-green-400" />
                                    ) : (
                                      <X style={{ width: '20px', height: '20px', minWidth: '20px', minHeight: '20px' }} className="text-red-700" />
                                    )}
                                  </div>
                                  <Badge
                                    variant={
                                      enrichment.value === true ||
                                      enrichment.value === "true" ||
                                      enrichment.value === "Yes"
                                        ? "default"
                                        : "secondary"
                                    }
                                    className={
                                      enrichment.value === true ||
                                      enrichment.value === "true" ||
                                      enrichment.value === "Yes"
                                        ? "bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30"
                                        : "bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/30"
                                    }
                                  >
                                    {enrichment.value === true ||
                                    enrichment.value === "true" ||
                                    enrichment.value === "Yes"
                                      ? "Yes"
                                      : "No"}
                                  </Badge>
                                </div>
                              ) : typeof enrichment.value === "string" &&
                                (enrichment.value.startsWith("http://") ||
                                  enrichment.value.startsWith("https://")) ? (
                                <a
                                  href={String(enrichment.value)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-body-medium text-foreground/80 hover:text-foreground break-all"
                                >
                                  {enrichment.value}
                                </a>
                              ) : (
                                <p className="text-body-medium text-foreground leading-relaxed">
                                  {enrichment.value}
                                </p>
                              )}
                            </div>

                            {/* Corroboration Data */}
                            {enrichment && enrichment.corroboration && (
                              <div className="mt-3 pt-3 border-t border-border">
                                <div className="flex items-center gap-2 mb-2">
                                  {enrichment.corroboration.sources_agree ? (
                                    <span className="text-body-small text-foreground/80">
                                      All sources agree
                                    </span>
                                  ) : (
                                    <span className="text-body-small text-foreground/80">
                                      Sources vary
                                    </span>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  {enrichment.corroboration.evidence
                                    .filter((e) => e.value !== null)
                                    .map((evidence, idx) => (
                                      <div
                                        key={idx}
                                        className="bg-accent/50 rounded p-2 space-y-1"
                                      >
                                        <div className="flex items-start justify-between gap-2">
                                          <a
                                            href={evidence.source_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-body-x-small text-foreground/80 hover:text-foreground"
                                          >
                                            {
                                              new URL(evidence.source_url)
                                                .hostname
                                            }
                                          </a>
                                        </div>
                                        {evidence.exact_text && (
                                          <p className="text-body-x-small text-muted-foreground italic">
                                            &quot;{evidence.exact_text}&quot;
                                          </p>
                                        )}
                                        <p className="text-body-x-small text-foreground">
                                          Found:{" "}
                                          {JSON.stringify(evidence.value)}
                                        </p>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}

                            {/* Source Context (fallback if no corroboration) */}
                            {enrichment &&
                              !enrichment.corroboration &&
                              enrichment.sourceContext &&
                              enrichment.sourceContext.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-border">
                                  <button
                                    onClick={() => {
                                      const sourceKey = `${field.name}-sources`;
                                      setExpandedSources((prev) => {
                                        const newSet = new Set<string>(prev);
                                        if (!prev.has(sourceKey)) {
                                          newSet.add(sourceKey);
                                        } else {
                                          newSet.delete(sourceKey);
                                        }
                                        return newSet;
                                      });
                                    }}
                                    className="flex items-center gap-1 text-body-small text-foreground/80 hover:text-foreground transition-colors w-full"
                                  >
                                    <span>
                                      Sources ({enrichment.sourceContext.length}
                                      )
                                    </span>
                                    {expandedSources.has(
                                      `${field.name}-sources`,
                                    ) ? (
                                      <ChevronUp style={{ width: '16px', height: '16px' }} />
                                    ) : (
                                      <ChevronDown style={{ width: '16px', height: '16px' }} />
                                    )}
                                  </button>
                                  {expandedSources.has(
                                    `${field.name}-sources`,
                                  ) && (
                                    <div className="space-y-1.5 pl-4 mt-2">
                                      {enrichment.sourceContext.map(
                                        (source, idx) => (
                                          <div key={idx} className="group">
                                            <a
                                              href={source.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="flex items-start gap-2 text-body-x-small text-foreground/80 hover:text-foreground"
                                            >
                                              <span className="break-all">
                                                {new URL(source.url).hostname}
                                              </span>
                                            </a>
                                            {source.snippet && (
                                              <p className="text-body-x-small text-muted-foreground italic mt-0.5 pl-4 line-clamp-2">
                                                &quot;{source.snippet}&quot;
                                              </p>
                                            )}
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* AI Columns */}
                {aiColumns.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="h-px flex-1 bg-purple-200" />
                      <h3 className="text-label-medium text-foreground font-semibold flex items-center gap-1.5">
                        <Sparkles style={{ width: '14px', height: '14px' }} className="text-purple-500" />
                        AI Columns
                      </h3>
                      <div className="h-px flex-1 bg-purple-200" />
                    </div>

                    <div className="space-y-3">
                      {aiColumns.map((col) => {
                        const cellResult = col.results.get(selectedRow.index);
                        return (
                          <Card
                            key={col.id}
                            className="p-4 bg-purple-500/10 border-purple-500/20 rounded-md"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <Label className="text-label-medium text-muted-foreground flex items-center gap-1.5">
                                <Sparkles style={{ width: '12px', height: '12px' }} className="text-purple-400" />
                                {col.displayName}
                              </Label>
                              <Badge className="bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30 text-body-x-small">
                                {col.type === "boolean" ? "Yes/No" : col.type === "number" ? "Number" : "Text"}
                              </Badge>
                            </div>
                            <div className="text-foreground">
                              {!cellResult || cellResult.status === "pending" ? (
                                <span className="text-muted-foreground/60 italic">Pending...</span>
                              ) : cellResult.status === "error" ? (
                                <span className="text-red-600">Error</span>
                              ) : col.type === "boolean" ? (
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                      cellResult.value === true || cellResult.value === "true"
                                        ? "bg-green-500/20"
                                        : "bg-red-500/20"
                                    }`}
                                  >
                                    {cellResult.value === true || cellResult.value === "true" ? (
                                      <Check style={{ width: '14px', height: '14px' }} className="text-green-600 dark:text-green-400" />
                                    ) : (
                                      <X style={{ width: '14px', height: '14px' }} className="text-red-700" />
                                    )}
                                  </div>
                                  <Badge
                                    className={
                                      cellResult.value === true || cellResult.value === "true"
                                        ? "bg-green-500/20 text-green-600 dark:text-green-400"
                                        : "bg-red-500/20 text-red-600 dark:text-red-400"
                                    }
                                  >
                                    {cellResult.value === true || cellResult.value === "true" ? "Yes" : "No"}
                                  </Badge>
                                </div>
                              ) : col.type === "number" ? (
                                <span className="font-mono text-body-medium">{cellResult.value}</span>
                              ) : (
                                <p className="text-body-medium text-foreground leading-relaxed">
                                  {cellResult.value || "-"}
                                </p>
                              )}
                            </div>
                            <p className="text-body-x-small text-muted-foreground/60 mt-2 italic">
                              Prompt: {col.prompt}
                            </p>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Original Data */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-px flex-1 bg-border" />
                    <h3 className="text-label-medium text-foreground font-semibold">
                      Original Data
                    </h3>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <Card className="p-4 bg-accent/50 border-border rounded-md">
                    <div className="space-y-3">
                      {Object.entries(selectedRow.row).map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-start justify-between gap-4"
                        >
                          <Label className="text-label-medium text-muted-foreground min-w-[120px]">
                            {key}
                          </Label>
                          <span className="text-body-medium text-foreground text-right break-all">
                            {value || (
                              <span className="italic text-muted-foreground/60">
                                Empty
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>

                {/* Action Buttons */}
                <div className="pt-6 pb-4 border-t border-border space-y-3">
                  <button
                    onClick={() => {
                      copyRowData(selectedRow.index);
                      toast.success("Row data copied to clipboard!");
                    }}
                    className="w-full rounded-8 px-10 py-6 gap-4 text-label-medium text-foreground bg-accent hover:bg-accent/80 transition-colors flex items-center justify-center"
                  >
                    <Copy style={{ width: '16px', height: '16px' }} />
                    Copy Row Data
                  </button>
                  {selectedRow.result?.enrichments.website?.value && (
                    <a
                      href={String(selectedRow.result.enrichments.website.value)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full rounded-8 px-10 py-6 gap-4 text-label-medium text-foreground bg-accent hover:bg-accent/80 transition-colors flex items-center justify-center"
                    >
                      <Globe style={{ width: '16px', height: '16px' }} />
                      Visit Website
                      <ExternalLink style={{ width: '16px', height: '16px' }} />
                    </a>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* AI Column Dialog */}
      <Dialog open={showAIColumnDialog} onOpenChange={setShowAIColumnDialog}>
        <DialogContent className="bg-card max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles style={{ width: '20px', height: '20px' }} className="text-purple-500" />
              Add AI Column
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-label-medium text-foreground/80 mb-2 block">Column Name</Label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="e.g. Is B2B?, Lead Score, Summary..."
                value={aiColumnName}
                onChange={(e) => setAiColumnName(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-label-medium text-foreground/80 mb-2 block">AI Prompt</Label>
              <textarea
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                rows={3}
                placeholder="e.g. Based on the company data, is this a B2B SaaS company?"
                value={aiColumnPrompt}
                onChange={(e) => setAiColumnPrompt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                The AI will see all row data + enriched fields for each row.
              </p>
            </div>
            <div>
              <Label className="text-label-medium text-foreground/80 mb-2 block">Output Type</Label>
              <div className="flex gap-2">
                {(["string", "number", "boolean"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setAiColumnType(t)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                      aiColumnType === t
                        ? "border-purple-500 bg-purple-50 text-purple-700"
                        : "border-border text-muted-foreground hover:border-border"
                    }`}
                  >
                    {t === "string" ? "Text" : t === "number" ? "Number" : "Yes/No"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAIColumnDialog(false)}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={createAndRunAIColumn}
              disabled={aiColumnLoading || !aiColumnName.trim() || !aiColumnPrompt.trim()}
              className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {aiColumnLoading ? (
                <>
                  <Loader2 style={{ width: '14px', height: '14px' }} className="animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Sparkles style={{ width: '14px', height: '14px' }} />
                  Create & Run
                </>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Chat Panel - positioned absolutely on the right */}
      <ChatPanel
        messages={agentMessages}
        onSendMessage={handleChatMessage}
        onStopQuery={handleStopQuery}
        isProcessing={isChatProcessing}
        totalRows={rows.length}
        results={results}
        onExpandedChange={setIsChatExpanded}
      />
    </div>
  );
}
