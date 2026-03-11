"use client";

import { useState, useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import Button from "@/components/shared/button/button";
import { Play, ChevronDown, Loader2 } from "lucide-react";
import type { SQLQueryResult } from "@/lib/types";

interface SQLConsoleProps {
  projectId: string;
  columns: string[];
}

interface SQLTemplate {
  label: string;
  query: string;
}

const TEMPLATES: SQLTemplate[] = [
  {
    label: "All data",
    query: "SELECT * FROM data LIMIT 100",
  },
  {
    label: "With email",
    query: "SELECT * FROM data WHERE email_generique IS NOT NULL",
  },
  {
    label: "Count by source",
    query: "SELECT _source_name as source, COUNT(*) as total FROM data GROUP BY _source_name",
  },
  {
    label: "Missing data",
    query: "SELECT nom_entreprise, _source_name FROM data WHERE site_web IS NULL",
  },
];

export function SQLConsole({ projectId, columns }: SQLConsoleProps) {
  const [query, setQuery] = useState("SELECT * FROM data LIMIT 100");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SQLQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleRun = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Query failed (${res.status})`);
      }

      const data: SQLQueryResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleRun();
    }
  };

  const applyTemplate = (template: SQLTemplate) => {
    setQuery(template.query);
    setResult(null);
    setError(null);
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Query input area */}
      <div
        className="border-b border-border bg-card flex flex-col"
        style={{ padding: "8px 12px", gap: 8 }}
      >
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="SELECT * FROM data LIMIT 100"
          rows={3}
          className="w-full bg-muted border border-border rounded-md text-sm text-foreground outline-none resize-none"
          style={{
            fontFamily: "monospace",
            fontSize: 13,
            padding: "8px 10px",
            lineHeight: 1.5,
          }}
        />

        <div className="flex items-center" style={{ gap: 8 }}>
          <Button
            variant="primary"
            size="default"
            onClick={handleRun}
            disabled={loading || !query.trim()}
            style={{ fontSize: 12, padding: "4px 12px" }}
          >
            {loading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Play size={13} />
            )}
            Run
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="default" style={{ fontSize: 12, padding: "4px 10px" }}>
                Templates
                <ChevronDown size={12} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {TEMPLATES.map((t) => (
                <DropdownMenuItem key={t.label} onClick={() => applyTemplate(t)}>
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {result && (
            <span className="text-xs text-muted-foreground" style={{ marginLeft: "auto" }}>
              {result.rowCount} rows in {result.executionTimeMs}ms
            </span>
          )}

          <span className="text-xs text-muted-foreground" style={{ marginLeft: result ? 0 : "auto" }}>
            Cmd+Enter to run
          </span>
        </div>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
        {error && (
          <div
            className="text-sm text-red-600 bg-red-50 border-b border-red-200"
            style={{ padding: "8px 12px" }}
          >
            {error}
          </div>
        )}

        {result && result.rows.length > 0 && (
          <div className="overflow-auto h-full">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {result.columns.map((col) => (
                    <th
                      key={col}
                      className="text-left text-xs font-medium text-muted-foreground border-b border-border"
                      style={{ padding: "6px 10px", whiteSpace: "nowrap" }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-border/50 hover:bg-muted/50"
                  >
                    {result.columns.map((col) => (
                      <td
                        key={col}
                        className="text-xs text-foreground"
                        style={{
                          padding: "4px 10px",
                          maxWidth: 250,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row[col] != null ? String(row[col]) : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result && result.rows.length === 0 && (
          <div
            className="text-sm text-muted-foreground text-center"
            style={{ padding: 24 }}
          >
            Query returned no results.
          </div>
        )}

        {!result && !error && (
          <div
            className="text-sm text-muted-foreground text-center"
            style={{ padding: 24, opacity: 0.6 }}
          >
            Run a query to see results here.
          </div>
        )}
      </div>
    </div>
  );
}
