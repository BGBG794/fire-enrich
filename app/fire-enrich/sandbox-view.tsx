"use client";

import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import Input from "@/components/ui/input";
import Button from "@/components/shared/button/button";
import { DataTab } from "./sandbox/data-tab";
import { EnrichTab } from "./sandbox/enrich-tab";
import { ResultsTab } from "./sandbox/results-tab";
import type { View } from "./app-sidebar";
import type { CSVRow, EnrichmentField, EnrichmentMode, PipelineConfig } from "@/lib/types";
import { safeLocalStorage } from "@/lib/utils/safe-storage";
import { toast } from "sonner";
import {
  Database,
  Sparkles,
  Table2,
  Loader2,
  ExternalLink,
} from "lucide-react";

interface SandboxViewProps {
  projectId: string | null;
  tab: "data" | "enrich" | "results";
  onNavigate: (view: View) => void;
  onProjectUpdated?: () => void;
}

export function SandboxView({
  projectId,
  tab,
  onNavigate,
  onProjectUpdated,
}: SandboxViewProps) {
  // Project data
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<{ id: string; rowIndex: number; data: CSVRow }>>([]);

  // New project dialog
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  // API key modal state (same pattern as source-view.tsx)
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [firecrawlApiKey, setFirecrawlApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [serperApiKey, setSerperApiKey] = useState("");
  const [isValidatingApiKey, setIsValidatingApiKey] = useState(false);
  const [missingKeys, setMissingKeys] = useState<{
    firecrawl: boolean;
    openai: boolean;
  }>({ firecrawl: false, openai: false });

  // Pending enrichment action after API key validation
  const [pendingEnrichment, setPendingEnrichment] = useState<{
    emailColumn: string;
    fields: EnrichmentField[];
    mode: EnrichmentMode;
  } | null>(null);

  // Show new project dialog if no projectId
  useEffect(() => {
    if (!projectId) {
      setShowNewProjectDialog(true);
    }
  }, [projectId]);

  // Load project data
  const loadProject = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      const project = data.project;
      if (!project) return;

      setColumns(project.columns as string[]);
      setRows(
        project.rows.map((r: { id: string; rowIndex: number; data: CSVRow }) => ({
          id: r.id,
          rowIndex: r.rowIndex,
          data: r.data,
        }))
      );
    } catch (e) {
      console.error("Failed to load project:", e);
      toast.error("Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Create new project
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim(), columns: [], rows: [] }),
      });
      const data = await res.json();
      if (data.projectId) {
        setShowNewProjectDialog(false);
        setNewProjectName("");
        onProjectUpdated?.();
        onNavigate({ type: "source", id: data.projectId, step: "data" });
      }
    } catch (e) {
      console.error("Failed to create project:", e);
      toast.error("Failed to create project");
    } finally {
      setCreatingProject(false);
    }
  };

  // Check API keys before starting enrichment
  const checkApiKeysAndEnrich = async (
    emailColumn: string,
    fields: EnrichmentField[],
    mode: EnrichmentMode
  ) => {
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
      setPendingEnrichment({ emailColumn, fields, mode });
      setMissingKeys({
        firecrawl: !hasSearchProvider,
        openai: !hasOpenAI && !savedOpenAIKey,
      });
      setShowApiKeyModal(true);
      return;
    }

    await startEnrichment(emailColumn, fields, mode);
  };

  // Start enrichment (save config and navigate to results)
  const startEnrichment = async (
    emailColumn: string,
    fields: EnrichmentField[],
    mode: EnrichmentMode
  ) => {
    if (!projectId) return;

    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailColumn, fields }),
      });
    } catch (e) {
      console.error("Failed to save fields:", e);
    }

    onNavigate({ type: "source", id: projectId, step: "results" });
  };

  // Start pipeline (save config and navigate to results)
  const handleStartPipeline = async (config: PipelineConfig) => {
    if (!projectId) return;

    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineConfig: config }),
      });
    } catch (e) {
      console.error("Failed to save pipeline config:", e);
    }

    onNavigate({ type: "source", id: projectId, step: "results" });
  };

  // API key submit handler
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

      if (pendingEnrichment) {
        await startEnrichment(
          pendingEnrichment.emailColumn,
          pendingEnrichment.fields,
          pendingEnrichment.mode
        );
        setPendingEnrichment(null);
      }
    } catch (error) {
      toast.error("Invalid API key. Please check and try again.");
    } finally {
      setIsValidatingApiKey(false);
    }
  };

  // Handle tab change
  const handleTabChange = (value: string) => {
    const tabValue = value as "data" | "enrich" | "results";
    onNavigate({ type: "source", id: projectId, step: tabValue });
  };

  // Map step back to tab value
  const activeTab = tab === "data" || tab === "enrich" || tab === "results" ? tab : "data";

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 256 }}>
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {projectId && (
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="flex flex-col h-full"
        >
          <div
            className="border-b border-border bg-card"
            style={{ padding: "0 16px" }}
          >
            <TabsList>
              <TabsTrigger value="data" className="flex items-center" style={{ gap: 6 }}>
                <Database size={14} />
                Data
              </TabsTrigger>
              <TabsTrigger value="enrich" className="flex items-center" style={{ gap: 6 }}>
                <Sparkles size={14} />
                Enrich
              </TabsTrigger>
              <TabsTrigger value="results" className="flex items-center" style={{ gap: 6 }}>
                <Table2 size={14} />
                Results
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="data" className="flex-1 overflow-hidden" style={{ marginTop: 0 }}>
            <DataTab
              projectId={projectId}
              columns={columns}
              rows={rows}
              onRefresh={loadProject}
              onNavigate={onNavigate}
            />
          </TabsContent>

          <TabsContent value="enrich" className="flex-1 overflow-auto" style={{ marginTop: 0 }}>
            {rows.length > 0 ? (
              <EnrichTab
                projectId={projectId}
                columns={columns}
                rows={rows}
                onStartEnrichment={checkApiKeysAndEnrich}
                onStartPipeline={handleStartPipeline}
                onNavigate={onNavigate}
              />
            ) : (
              <div
                className="flex flex-col items-center justify-center text-muted-foreground"
                style={{ padding: 64 }}
              >
                <p className="text-sm" style={{ marginBottom: 8 }}>
                  No data loaded. Import data first.
                </p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    onNavigate({ type: "source", id: projectId, step: "data" })
                  }
                >
                  Go to Data tab
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="results" className="flex-1 overflow-hidden" style={{ marginTop: 0 }}>
            <ResultsTab
              projectId={projectId}
              onNavigate={onNavigate}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* New Project Dialog */}
      <Dialog
        open={showNewProjectDialog}
        onOpenChange={(open) => {
          if (!open && !projectId) {
            onNavigate({ type: "home" });
          }
          setShowNewProjectDialog(open);
        }}
      >
        <DialogContent className="sm:max-w-md" style={{ padding: 24 }}>
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>
              Give your project a name to get started.
            </DialogDescription>
          </DialogHeader>
          <div style={{ padding: "12px 0" }}>
            <Input
              placeholder="Project name..."
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !creatingProject) handleCreateProject();
              }}
              disabled={creatingProject}
            />
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowNewProjectDialog(false);
                if (!projectId) onNavigate({ type: "home" });
              }}
              disabled={creatingProject}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateProject}
              disabled={creatingProject || !newProjectName.trim()}
            >
              {creatingProject ? (
                <span className="flex items-center" style={{ gap: 8 }}>
                  <Loader2 size={14} className="animate-spin" />
                  Creating...
                </span>
              ) : (
                "Create Project"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <div
                  className="flex items-center text-sm text-muted-foreground"
                  style={{ gap: 8 }}
                >
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
