"use client";

import { useState, useEffect, useCallback } from "react";
import { CampaignStepper, type StepDef } from "./campaign-stepper";
import { CSVUploader } from "./csv-uploader";
import { UnifiedEnrichmentView } from "./unified-enrichment-view";
import { EnrichmentTable } from "./enrichment-table";
import type { View } from "./app-sidebar";
import type {
  CSVRow,
  EnrichmentField,
  EnrichmentMode,
  PipelineConfig,
} from "@/lib/types";
import { safeLocalStorage } from "@/lib/utils/safe-storage";
import { toast } from "sonner";
import { Upload, Settings, Table2, Loader2, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Input from "@/components/ui/input";
import Button from "@/components/shared/button/button";

const STEPS: StepDef[] = [
  { id: "import", label: "Import", icon: Upload },
  { id: "configure", label: "Configure", icon: Settings },
  { id: "results", label: "Results", icon: Table2 },
];

interface SourceViewProps {
  sourceId: string | null;
  step: "import" | "configure" | "results";
  onNavigate: (view: View) => void;
  onSourceCreated?: () => void;
}

export function SourceView({
  sourceId,
  step,
  onNavigate,
  onSourceCreated,
}: SourceViewProps) {
  const [csvData, setCsvData] = useState<{
    rows: CSVRow[];
    columns: string[];
  } | null>(null);
  const [projectId, setProjectId] = useState<string | null>(sourceId);
  const [emailColumn, setEmailColumn] = useState("");
  const [selectedFields, setSelectedFields] = useState<EnrichmentField[]>([]);
  const [enrichmentMode, setEnrichmentMode] = useState<EnrichmentMode>("standard");
  const [pipelineConfig, setPipelineConfig] = useState<PipelineConfig | null>(null);
  const [loading, setLoading] = useState(false);

  // API key modal state
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [firecrawlApiKey, setFirecrawlApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [serperApiKey, setSerperApiKey] = useState("");
  const [isValidatingApiKey, setIsValidatingApiKey] = useState(false);
  const [missingKeys, setMissingKeys] = useState<{
    firecrawl: boolean;
    openai: boolean;
  }>({ firecrawl: false, openai: false });
  const [pendingCSVData, setPendingCSVData] = useState<{
    rows: CSVRow[];
    columns: string[];
  } | null>(null);

  // Load existing project data
  useEffect(() => {
    if (!sourceId) return;
    setLoading(true);
    fetch(`/api/projects/${sourceId}`)
      .then((r) => r.json())
      .then((data) => {
        const project = data.project;
        if (!project) return;
        const rows = project.rows.map((r: { data: CSVRow }) => r.data);
        const columns = project.columns as string[];
        setCsvData({ rows, columns });
        setProjectId(project.id);

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
          setSelectedFields(pipelineFields);
        } else if (project.emailColumn && project.fields.length > 0) {
          setEmailColumn(project.emailColumn);
          setSelectedFields(
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
        console.error("Failed to load project:", e);
        toast.error("Failed to load project");
      })
      .finally(() => setLoading(false));
  }, [sourceId]);

  const handleCSVUpload = async (rows: CSVRow[], columns: string[]) => {
    // Check API keys
    const response = await fetch("/api/check-env");
    const data = await response.json();
    const hasFirecrawl = data.environmentStatus.FIRECRAWL_API_KEY;
    const hasOpenAI = data.environmentStatus.OPENAI_API_KEY;
    const hasSerper = data.environmentStatus.SERPER_API_KEY;
    const savedFirecrawlKey = safeLocalStorage.getItem("firecrawl_api_key");
    const savedOpenAIKey = safeLocalStorage.getItem("openai_api_key");
    const savedSerperKey = safeLocalStorage.getItem("serper_api_key");
    const hasSearchProvider = hasFirecrawl || savedFirecrawlKey || hasSerper || savedSerperKey;

    if (!hasSearchProvider || (!hasOpenAI && !savedOpenAIKey)) {
      setPendingCSVData({ rows, columns });
      setMissingKeys({
        firecrawl: !hasSearchProvider,
        openai: !hasOpenAI && !savedOpenAIKey,
      });
      setShowApiKeyModal(true);
      return;
    }

    await createProjectAndAdvance(rows, columns);
  };

  const createProjectAndAdvance = async (rows: CSVRow[], columns: string[]) => {
    try {
      const projRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns, rows }),
      });
      const projData = await projRes.json();
      if (projData.projectId) {
        setProjectId(projData.projectId);
        setCsvData({ rows, columns });
        onSourceCreated?.();
        onNavigate({
          type: "source",
          id: projData.projectId,
          step: "configure",
        });
      }
    } catch (e) {
      console.error("Failed to create project:", e);
      toast.error("Failed to create project");
    }
  };

  const handleStartEnrichment = async (
    email: string,
    fields: EnrichmentField[],
    mode?: EnrichmentMode
  ) => {
    setEmailColumn(email);
    setSelectedFields(fields);
    if (mode) setEnrichmentMode(mode);

    if (projectId) {
      try {
        await fetch(`/api/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emailColumn: email, fields }),
        });
      } catch (e) {
        console.error("Failed to save fields:", e);
      }
    }

    onNavigate({
      type: "source",
      id: projectId,
      step: "results",
    });
  };

  const handleStartPipeline = async (config: PipelineConfig) => {
    setPipelineConfig(config);
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
    setSelectedFields(pipelineFields);
    setEmailColumn(config.identifierColumn);

    if (projectId) {
      try {
        await fetch(`/api/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pipelineConfig: config }),
        });
      } catch (e) {
        console.error("Failed to save pipeline config:", e);
      }
    }

    onNavigate({
      type: "source",
      id: projectId,
      step: "results",
    });
  };

  const handleStartOutreach = (id: string) => {
    onNavigate({ type: "campaign", id: null, step: "contacts" });
  };

  const handleApiKeySubmit = async () => {
    const response = await fetch("/api/check-env");
    const data = await response.json();
    const hasEnvFirecrawl = data.environmentStatus.FIRECRAWL_API_KEY;
    const hasEnvOpenAI = data.environmentStatus.OPENAI_API_KEY;
    const hasEnvSerper = data.environmentStatus.SERPER_API_KEY;
    const hasSavedFirecrawl = safeLocalStorage.getItem("firecrawl_api_key");
    const hasSavedOpenAI = safeLocalStorage.getItem("openai_api_key");
    const hasSavedSerper = safeLocalStorage.getItem("serper_api_key");

    const hasSearchProvider =
      hasEnvFirecrawl || hasSavedFirecrawl || hasEnvSerper || hasSavedSerper;
    const needsSearchProvider =
      !hasSearchProvider && !firecrawlApiKey.trim() && !serperApiKey.trim();
    const needsOpenAI = !hasEnvOpenAI && !hasSavedOpenAI;

    if (needsSearchProvider) {
      toast.error("Please enter a Serper or Firecrawl API key");
      return;
    }
    if (needsOpenAI && !openaiApiKey.trim()) {
      toast.error("Please enter a valid OpenAI API key");
      return;
    }

    setIsValidatingApiKey(true);
    try {
      if (serperApiKey) safeLocalStorage.setItem("serper_api_key", serperApiKey);
      if (firecrawlApiKey) safeLocalStorage.setItem("firecrawl_api_key", firecrawlApiKey);
      if (openaiApiKey) safeLocalStorage.setItem("openai_api_key", openaiApiKey);

      toast.success("API keys saved successfully!");
      setShowApiKeyModal(false);

      if (pendingCSVData) {
        await createProjectAndAdvance(pendingCSVData.rows, pendingCSVData.columns);
        setPendingCSVData(null);
      }
    } catch (error) {
      toast.error("Invalid API key. Please check and try again.");
    } finally {
      setIsValidatingApiKey(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 256 }}>
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Stepper */}
      <div style={{ padding: "24px 16px 8px" }} className="sm:px-24 lg:px-32">
        <CampaignStepper
          steps={STEPS}
          activeStep={step}
          onStepClick={(s) =>
            onNavigate({
              type: "source",
              id: projectId,
              step: s as "import" | "configure" | "results",
            })
          }
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {step === "import" && (
          <div className="mx-auto" style={{ maxWidth: 768, padding: "32px 16px" }}>
            <div style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-foreground" style={{ marginBottom: 4 }}>
                Import Data
              </h2>
              <p className="text-sm text-muted-foreground">
                Upload a CSV file with your contact data
              </p>
            </div>
            <div className="bg-card rounded-12 border border-border shadow-sm" style={{ padding: 24 }}>
              <CSVUploader onUpload={handleCSVUpload} />
            </div>
          </div>
        )}

        {step === "configure" && csvData && (
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
                rows={csvData.rows}
                columns={csvData.columns}
                onStartEnrichment={handleStartEnrichment}
                onStartPipeline={handleStartPipeline}
              />
            </div>
          </div>
        )}

        {step === "results" && csvData && (
          <div className="h-full">
            <EnrichmentTable
              rows={csvData.rows}
              fields={selectedFields}
              emailColumn={emailColumn}
              projectId={projectId || undefined}
              enrichmentMode={enrichmentMode}
              pipelineConfig={pipelineConfig || undefined}
              onStartOutreach={handleStartOutreach}
            />
          </div>
        )}

        {step === "configure" && !csvData && !sourceId && (
          <div className="text-center text-muted-foreground" style={{ padding: "64px 16px" }}>
            <p>No data loaded. Please import a CSV first.</p>
            <button
              onClick={() =>
                onNavigate({ type: "source", id: null, step: "import" })
              }
              className="text-sm text-orange-500 hover:underline"
              style={{ marginTop: 16 }}
            >
              Go to Import
            </button>
          </div>
        )}
      </div>

      {/* API Key Modal */}
      <Dialog open={showApiKeyModal} onOpenChange={setShowApiKeyModal}>
        <DialogContent className="sm:max-w-md rounded-8" style={{ padding: 24 }}>
          <DialogHeader>
            <DialogTitle>API Keys Required</DialogTitle>
            <DialogDescription>
              This tool requires API keys for a search provider and OpenAI.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col" style={{ gap: 16, padding: "16px 0" }}>
            {missingKeys.firecrawl && (
              <>
                <p className="text-sm text-muted-foreground">
                  Search provider (choose one):
                </p>
                <div className="flex flex-col" style={{ gap: 8 }}>
                  <label className="text-sm font-medium">
                    Serper API Key (recommended)
                  </label>
                  <Input
                    type="password"
                    placeholder="serper key..."
                    value={serperApiKey}
                    onChange={(e) => setSerperApiKey(e.target.value)}
                    disabled={isValidatingApiKey}
                  />
                  <Button
                    onClick={() => window.open("https://serper.dev", "_blank")}
                    variant="secondary"
                    size="default"
                    className="flex items-center w-fit"
                    style={{ gap: 8 }}
                  >
                    <ExternalLink size={14} />
                    Get Serper Key
                  </Button>
                </div>
                <div className="flex items-center text-sm text-muted-foreground" style={{ gap: 8 }}>
                  <span className="flex-1 bg-border" style={{ height: 1 }} />
                  or
                  <span className="flex-1 bg-border" style={{ height: 1 }} />
                </div>
                <div className="flex flex-col" style={{ gap: 8 }}>
                  <label className="text-sm font-medium">Firecrawl API Key</label>
                  <Input
                    type="password"
                    placeholder="fc-..."
                    value={firecrawlApiKey}
                    onChange={(e) => setFirecrawlApiKey(e.target.value)}
                    disabled={isValidatingApiKey}
                  />
                </div>
              </>
            )}
            {missingKeys.openai && (
              <div className="flex flex-col" style={{ gap: 8 }}>
                <label className="text-sm font-medium">OpenAI API Key</label>
                <Input
                  type="password"
                  placeholder="sk-..."
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isValidatingApiKey)
                      handleApiKeySubmit();
                  }}
                  disabled={isValidatingApiKey}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setShowApiKeyModal(false)}
              disabled={isValidatingApiKey}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApiKeySubmit}
              disabled={
                isValidatingApiKey ||
                (!firecrawlApiKey.trim() && !serperApiKey.trim())
              }
              variant="primary"
            >
              {isValidatingApiKey ? (
                <span className="flex items-center" style={{ gap: 8 }}>
                  <Loader2 size={14} className="animate-spin" />
                  Validating...
                </span>
              ) : (
                "Submit"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
