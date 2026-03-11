"use client";

import { useState, useEffect } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { EnrichmentTable } from "../enrichment-table";
import { SQLConsole } from "./sql-console";
import type { View } from "../app-sidebar";
import type { CSVRow, EnrichmentField, EnrichmentMode, PipelineConfig } from "@/lib/types";
import { Loader2 } from "lucide-react";

interface ResultsTabProps {
  projectId: string;
  onNavigate: (view: View) => void;
}

export function ResultsTab({ projectId, onNavigate }: ResultsTabProps) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CSVRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [fields, setFields] = useState<EnrichmentField[]>([]);
  const [emailColumn, setEmailColumn] = useState<string>("");
  const [enrichmentMode, setEnrichmentMode] = useState<EnrichmentMode>("standard");
  const [pipelineConfig, setPipelineConfig] = useState<PipelineConfig | undefined>(undefined);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);

    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        const project = data.project;
        if (!project) return;

        const csvRows = project.rows.map((r: { data: CSVRow }) => r.data);
        const cols = project.columns as string[];
        setRows(csvRows);
        setColumns(cols);
        setEmailColumn(project.emailColumn || "");

        if (project.mode === "pipeline" && project.pipelineConfig) {
          const config: PipelineConfig =
            typeof project.pipelineConfig === "string"
              ? JSON.parse(project.pipelineConfig)
              : project.pipelineConfig;
          setPipelineConfig(config);
          setEmailColumn(config.identifierColumn);

          const pipelineFields = config.steps.flatMap((s) => {
            if (s.type === "contact_search") {
              return (s.contactSearchConfig?.jobTitles || ["CEO"]).flatMap((title) => {
                const titleKey = title.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
                return [
                  { name: `${s.name}__${titleKey}_linkedin_url`, displayName: `${title} LinkedIn`, description: "", type: "string" as const, required: false },
                  { name: `${s.name}__${titleKey}_name`, displayName: `${title} Name`, description: "", type: "string" as const, required: false },
                  { name: `${s.name}__${titleKey}_email`, displayName: `${title} Email`, description: "", type: "string" as const, required: false },
                ];
              });
            }
            return s.outputFields
              .filter((f) => f.displayName.trim())
              .map((f) => ({
                ...f,
                name: `${s.name}__${f.name}`,
                displayName: `${s.name} - ${f.displayName}`,
              }));
          });
          setFields(pipelineFields);
        } else if (project.fields && project.fields.length > 0) {
          setFields(
            project.fields.map((f: any) => ({
              name: f.name,
              displayName: f.displayName,
              description: f.description,
              type: f.type,
              required: !!f.required,
            }))
          );
        }
      })
      .catch((e) => {
        console.error("Failed to load project for results:", e);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleStartOutreach = (id: string) => {
    onNavigate({ type: "campaign", id: null, step: "contacts" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 256 }}>
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  return (
    <PanelGroup direction="vertical" className="h-full">
      <Panel defaultSize={70} minSize={30}>
        <div className="h-full overflow-hidden">
          <EnrichmentTable
            rows={rows}
            fields={fields}
            emailColumn={emailColumn}
            projectId={projectId}
            enrichmentMode={enrichmentMode}
            pipelineConfig={pipelineConfig}
            onStartOutreach={handleStartOutreach}
          />
        </div>
      </Panel>

      <PanelResizeHandle
        className="bg-border hover:bg-blue-400 transition-colors"
        style={{ height: 2 }}
      />

      <Panel defaultSize={30} minSize={10} collapsible>
        <div className="h-full overflow-hidden border-t border-border">
          <SQLConsole projectId={projectId} columns={columns} />
        </div>
      </Panel>
    </PanelGroup>
  );
}
