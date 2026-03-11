"use client";

import { useState, useEffect, useCallback } from "react";
import { CampaignStepper, type StepDef } from "./campaign-stepper";
import { TemplateEditor } from "./outreach/template-editor";
import { SequenceBuilder } from "./outreach/sequence-builder";
import { CampaignBuilder } from "./outreach/campaign-builder";
import { CampaignAnalytics } from "./outreach/campaign-analytics";
import { SendProgress } from "./outreach/send-progress";
import type { View, SidebarSource } from "./app-sidebar";
import type {
  Campaign,
  EmailTemplate,
  Sequence,
  TemplateVariable,
} from "@/lib/types";
import {
  Users,
  Mail,
  Rocket,
  BarChart3,
  FileSpreadsheet,
  Loader2,
  CheckCircle,
  ArrowRight,
} from "lucide-react";

const STEPS: StepDef[] = [
  { id: "contacts", label: "Contacts", icon: Users },
  { id: "sequences", label: "Sequences", icon: Mail },
  { id: "launch", label: "Launch", icon: Rocket },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

interface CampaignViewProps {
  campaignId: string | null;
  step: "contacts" | "sequences" | "launch" | "analytics";
  sources: SidebarSource[];
  onNavigate: (view: View) => void;
  onCampaignCreated?: () => void;
}

export function CampaignView({
  campaignId,
  step,
  sources,
  onNavigate,
  onCampaignCreated,
}: CampaignViewProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [emailFieldOptions, setEmailFieldOptions] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [launchingCampaignId, setLaunchingCampaignId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The projectId is either from the campaign or the selected source
  const projectId = campaign?.projectId || selectedSourceId;

  // Load campaign data if editing an existing one
  useEffect(() => {
    if (!campaignId) return;
    setLoading(true);
    fetch(`/api/outreach/campaigns/${campaignId}`)
      .then(async (r) => {
        if (r.ok) {
          // The campaign endpoint returns campaign data
          // But we need to get it from the list endpoint
          // Let's try to find it from the list
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [campaignId]);

  // Load outreach data when we have a projectId
  const loadOutreachData = useCallback(async () => {
    if (!projectId) return;
    const [templatesRes, sequencesRes, variablesRes] = await Promise.all([
      fetch(`/api/outreach/templates?projectId=${projectId}`),
      fetch(`/api/outreach/sequences?projectId=${projectId}`),
      fetch(`/api/outreach/variables?projectId=${projectId}`),
    ]);

    if (templatesRes.ok) setTemplates(await templatesRes.json());
    if (sequencesRes.ok) setSequences(await sequencesRes.json());
    if (variablesRes.ok) {
      const vars: TemplateVariable[] = await variablesRes.json();
      setVariables(vars);
      setEmailFieldOptions(
        vars
          .filter(
            (v) =>
              v.key.toLowerCase().includes("email") ||
              v.key.toLowerCase().includes("mail")
          )
          .map((v) => v.key)
      );
    }

    // Get source row count
    const source = sources.find((s) => s.id === projectId);
    if (source) {
      setTotalRows(source.rowCount);
    }
  }, [projectId, sources]);

  useEffect(() => {
    loadOutreachData();
  }, [loadOutreachData]);

  // Load existing campaigns for analytics
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/outreach/campaigns?projectId=${projectId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCampaigns(data))
      .catch(() => {});
  }, [projectId]);

  const completedSources = sources.filter(
    (s) => s.status === "completed" || s.status === "enriching"
  );

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
              type: "campaign",
              id: campaignId,
              step: s as "contacts" | "sequences" | "launch" | "analytics",
            })
          }
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "32px 16px" }}>
        {step === "contacts" && (
          <div className="mx-auto" style={{ maxWidth: 768 }}>
            <div style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-foreground" style={{ marginBottom: 4 }}>
                Select Data Source
              </h2>
              <p className="text-sm text-muted-foreground">
                Choose a data source for your campaign contacts
              </p>
            </div>

            {completedSources.length === 0 ? (
              <div className="text-center text-muted-foreground" style={{ padding: "48px 0" }}>
                <FileSpreadsheet
                  size={40}
                  className="mx-auto text-muted-foreground/50"
                  style={{ marginBottom: 12 }}
                />
                <p className="text-sm" style={{ marginBottom: 16 }}>
                  No enriched data sources available. Import and enrich data
                  first.
                </p>
                <button
                  onClick={() =>
                    onNavigate({ type: "source", id: null, step: "data" })
                  }
                  className="text-sm text-orange-500 hover:underline"
                >
                  Import CSV
                </button>
              </div>
            ) : (
              <div className="flex flex-col" style={{ gap: 12 }}>
                {completedSources.map((source) => (
                  <button
                    key={source.id}
                    onClick={() => {
                      setSelectedSourceId(source.id);
                      onNavigate({
                        type: "campaign",
                        id: campaignId,
                        step: "sequences",
                      });
                    }}
                    className={`flex items-center rounded-12 border shadow-sm transition-all text-left ${
                      selectedSourceId === source.id
                        ? "border-orange-500 bg-orange-500/5 shadow-orange-500/10"
                        : "border-border bg-card hover:border-orange-500/50 hover:bg-accent"
                    }`}
                    style={{ gap: 12, padding: 16 }}
                  >
                    <FileSpreadsheet size={20} className="text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground">
                        {source.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {source.rowCount} contacts ·{" "}
                        {new Date(source.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center" style={{ gap: 8 }}>
                      {source.status === "completed" && (
                        <CheckCircle size={14} className="text-green-500" />
                      )}
                      <ArrowRight size={14} className="text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedSourceId && (
              <div className="flex justify-end" style={{ marginTop: 24 }}>
                <button
                  onClick={() =>
                    onNavigate({
                      type: "campaign",
                      id: campaignId,
                      step: "sequences",
                    })
                  }
                  className="flex items-center bg-orange-500 text-white rounded-8 text-sm font-medium hover:bg-orange-600 transition-colors"
                  style={{ gap: 8, padding: "8px 16px" }}
                >
                  Continue to Sequences
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {step === "sequences" && projectId && (
          <div className="mx-auto" style={{ maxWidth: 1024 }}>
            <div className="flex flex-col" style={{ gap: 32 }}>
              <div className="bg-card rounded-12 border border-border shadow-sm" style={{ padding: 24 }}>
                <h3 className="text-base font-semibold text-foreground" style={{ marginBottom: 16 }}>
                  Email Templates
                </h3>
                <TemplateEditor
                  projectId={projectId}
                  templates={templates}
                  variables={variables}
                  onSave={loadOutreachData}
                />
              </div>
              <div className="bg-card rounded-12 border border-border shadow-sm" style={{ padding: 24 }}>
                <h3 className="text-base font-semibold text-foreground" style={{ marginBottom: 16 }}>
                  Sequences
                </h3>
                <SequenceBuilder
                  projectId={projectId}
                  templates={templates}
                  onSave={loadOutreachData}
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() =>
                    onNavigate({
                      type: "campaign",
                      id: campaignId,
                      step: "launch",
                    })
                  }
                  className="flex items-center bg-orange-500 text-white rounded-8 text-sm font-medium hover:bg-orange-600 transition-colors"
                  style={{ gap: 8, padding: "8px 16px" }}
                >
                  Continue to Launch
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "sequences" && !projectId && (
          <div className="text-center text-muted-foreground" style={{ padding: "48px 0" }}>
            <p className="text-sm" style={{ marginBottom: 16 }}>
              Please select a data source first.
            </p>
            <button
              onClick={() =>
                onNavigate({
                  type: "campaign",
                  id: campaignId,
                  step: "contacts",
                })
              }
              className="text-sm text-orange-500 hover:underline"
            >
              Go to Contacts
            </button>
          </div>
        )}

        {step === "launch" && projectId && (
          <div className="mx-auto" style={{ maxWidth: 1024 }}>
            <CampaignBuilder
              projectId={projectId}
              sequences={sequences}
              totalRows={totalRows}
              emailFieldOptions={emailFieldOptions}
              onLaunch={(id) => {
                setLaunchingCampaignId(id);
                onCampaignCreated?.();
              }}
            />
          </div>
        )}

        {step === "launch" && !projectId && (
          <div className="text-center text-muted-foreground" style={{ padding: "48px 0" }}>
            <p className="text-sm" style={{ marginBottom: 16 }}>
              Please select a data source and create sequences first.
            </p>
            <button
              onClick={() =>
                onNavigate({
                  type: "campaign",
                  id: campaignId,
                  step: "contacts",
                })
              }
              className="text-sm text-orange-500 hover:underline"
            >
              Go to Contacts
            </button>
          </div>
        )}

        {step === "analytics" && projectId && (
          <div className="mx-auto" style={{ maxWidth: 1024 }}>
            <div className="flex flex-col" style={{ gap: 24 }}>
              {campaigns.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm" style={{ padding: "48px 0" }}>
                  No campaigns launched yet. Create and launch a campaign first.
                </div>
              ) : (
                campaigns.map((c) => (
                  <CampaignAnalytics key={c.id} campaign={c} />
                ))
              )}
            </div>
          </div>
        )}

        {step === "analytics" && !projectId && (
          <div className="text-center text-muted-foreground" style={{ padding: "48px 0" }}>
            <p className="text-sm" style={{ marginBottom: 16 }}>
              Please select a data source first.
            </p>
            <button
              onClick={() =>
                onNavigate({
                  type: "campaign",
                  id: campaignId,
                  step: "contacts",
                })
              }
              className="text-sm text-orange-500 hover:underline"
            >
              Go to Contacts
            </button>
          </div>
        )}
      </div>

      {/* Send progress overlay */}
      {launchingCampaignId && (
        <SendProgress
          campaignId={launchingCampaignId}
          onComplete={() => {
            loadOutreachData();
            onCampaignCreated?.();
          }}
          onClose={() => {
            setLaunchingCampaignId(null);
            onNavigate({
              type: "campaign",
              id: campaignId,
              step: "analytics",
            });
          }}
        />
      )}
    </div>
  );
}
