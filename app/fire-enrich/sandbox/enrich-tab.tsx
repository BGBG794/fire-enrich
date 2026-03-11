"use client";

import { UnifiedEnrichmentView } from "../unified-enrichment-view";
import type { View } from "../app-sidebar";
import type { CSVRow, EnrichmentField, EnrichmentMode, PipelineConfig } from "@/lib/types";

interface EnrichTabProps {
  projectId: string;
  columns: string[];
  rows: Array<{ id: string; rowIndex: number; data: CSVRow }>;
  onStartEnrichment: (emailColumn: string, fields: EnrichmentField[], mode: EnrichmentMode) => void;
  onStartPipeline: (config: PipelineConfig) => void;
  onNavigate: (view: View) => void;
}

export function EnrichTab({
  projectId,
  columns,
  rows,
  onStartEnrichment,
  onStartPipeline,
  onNavigate,
}: EnrichTabProps) {
  // Extract raw CSVRow[] from the row objects for the UnifiedEnrichmentView
  const csvRows = rows.map((r) => r.data);

  return (
    <div className="w-full mx-auto" style={{ padding: "32px 16px" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 className="text-xl font-bold text-foreground" style={{ marginBottom: 4 }}>
          Configure Enrichment
        </h2>
        <p className="text-sm text-muted-foreground">
          Select the fields you want to enrich and configure your settings
        </p>
      </div>
      <div className="bg-card rounded-12 border border-border shadow-sm" style={{ padding: 24 }}>
        <UnifiedEnrichmentView
          rows={csvRows}
          columns={columns}
          onStartEnrichment={(emailColumn, fields, mode) => {
            onStartEnrichment(emailColumn, fields, mode || "standard");
          }}
          onStartPipeline={onStartPipeline}
        />
      </div>
    </div>
  );
}
