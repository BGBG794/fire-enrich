"use client";

import { useState, useEffect, useCallback } from "react";
import { TemplateEditor } from "./template-editor";
import { SequenceBuilder } from "./sequence-builder";
import { CampaignBuilder } from "./campaign-builder";
import { CampaignAnalytics } from "./campaign-analytics";
import { OutreachSettingsPanel } from "./outreach-settings";
import { WarmingPanel } from "./warming-panel";
import { SendProgress } from "./send-progress";
import type {
  EmailTemplate,
  Sequence,
  Campaign,
  TemplateVariable,
} from "@/lib/types";
import {
  Mail,
  ListOrdered,
  Rocket,
  BarChart3,
  Flame,
  Settings,
} from "lucide-react";

type Tab = "templates" | "sequences" | "campaigns" | "analytics" | "warming" | "settings";

interface OutreachDashboardProps {
  projectId: string;
  totalRows: number;
}

export function OutreachDashboard({
  projectId,
  totalRows,
}: OutreachDashboardProps) {
  const [tab, setTab] = useState<Tab>("templates");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [emailFieldOptions, setEmailFieldOptions] = useState<string[]>([]);
  const [launchingCampaignId, setLaunchingCampaignId] = useState<
    string | null
  >(null);

  const loadData = useCallback(async () => {
    const [templatesRes, sequencesRes, campaignsRes, variablesRes] =
      await Promise.all([
        fetch(`/api/outreach/templates?projectId=${projectId}`),
        fetch(`/api/outreach/sequences?projectId=${projectId}`),
        fetch(`/api/outreach/campaigns?projectId=${projectId}`),
        fetch(`/api/outreach/variables?projectId=${projectId}`),
      ]);

    if (templatesRes.ok) setTemplates(await templatesRes.json());
    if (sequencesRes.ok) setSequences(await sequencesRes.json());
    if (campaignsRes.ok) setCampaigns(await campaignsRes.json());
    if (variablesRes.ok) {
      const vars: TemplateVariable[] = await variablesRes.json();
      setVariables(vars);
      // Extract email-looking fields for campaign builder
      setEmailFieldOptions(
        vars
          .filter(
            (v) =>
              v.key.toLowerCase().includes("email") ||
              v.key.toLowerCase().includes("mail"),
          )
          .map((v) => v.key),
      );
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const tabs: { id: Tab; label: string; icon: typeof Mail }[] = [
    { id: "templates", label: "Templates", icon: Mail },
    { id: "sequences", label: "Sequences", icon: ListOrdered },
    { id: "campaigns", label: "Launch", icon: Rocket },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "warming", label: "Warming", icon: Flame },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-border pb-0">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
              tab === id
                ? "border-orange-500 text-orange-500"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={14} />
            {label}
            {id === "templates" && templates.length > 0 && (
              <span className="ml-1 text-[10px] bg-accent rounded-full px-1.5">
                {templates.length}
              </span>
            )}
            {id === "sequences" && sequences.length > 0 && (
              <span className="ml-1 text-[10px] bg-accent rounded-full px-1.5">
                {sequences.length}
              </span>
            )}
            {id === "analytics" && campaigns.length > 0 && (
              <span className="ml-1 text-[10px] bg-accent rounded-full px-1.5">
                {campaigns.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[300px]">
        {tab === "templates" && (
          <TemplateEditor
            projectId={projectId}
            templates={templates}
            variables={variables}
            onSave={loadData}
          />
        )}

        {tab === "sequences" && (
          <SequenceBuilder
            projectId={projectId}
            templates={templates}
            onSave={loadData}
          />
        )}

        {tab === "campaigns" && (
          <CampaignBuilder
            projectId={projectId}
            sequences={sequences}
            totalRows={totalRows}
            emailFieldOptions={emailFieldOptions}
            onLaunch={(id) => setLaunchingCampaignId(id)}
          />
        )}

        {tab === "analytics" && (
          <div className="space-y-6">
            {campaigns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No campaigns yet. Create and launch a campaign first.
              </div>
            ) : (
              campaigns.map((campaign) => (
                <CampaignAnalytics key={campaign.id} campaign={campaign} />
              ))
            )}
          </div>
        )}

        {tab === "warming" && <WarmingPanel />}

        {tab === "settings" && <OutreachSettingsPanel />}
      </div>

      {/* Send progress overlay */}
      {launchingCampaignId && (
        <SendProgress
          campaignId={launchingCampaignId}
          onComplete={() => {
            loadData();
          }}
          onClose={() => {
            setLaunchingCampaignId(null);
            setTab("analytics");
          }}
        />
      )}
    </div>
  );
}
