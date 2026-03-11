"use client";

import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "./fire-enrich/app-layout";
import { HomeView } from "./fire-enrich/home-view";
import { SandboxView } from "./fire-enrich/sandbox-view";
import { CampaignView } from "./fire-enrich/campaign-view";
import { WarmingPanel } from "./fire-enrich/outreach/warming-panel";
import { OutreachSettingsPanel } from "./fire-enrich/outreach/outreach-settings";
import type { View, SidebarSource } from "./fire-enrich/app-sidebar";
import type { Campaign } from "@/lib/types";

export default function HomePage() {
  const [view, setView] = useState<View>({ type: "home" });
  const [sources, setSources] = useState<SidebarSource[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  const loadSources = useCallback(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        const projects = data.projects || [];
        setSources(
          projects.map((p: any) => ({
            id: p.id,
            name: p.name,
            rowCount: p.rowCount || 0,
            status: p.status || "draft",
            createdAt: p.createdAt,
          }))
        );
      })
      .catch(() => {});
  }, []);

  const loadCampaigns = useCallback(() => {
    fetch("/api/outreach/campaigns")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCampaigns(data);
      })
      .catch(() => {});
  }, []);

  const loadAll = useCallback(() => {
    loadSources();
    loadCampaigns();
  }, [loadSources, loadCampaigns]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return (
    <AppLayout
      sources={sources}
      campaigns={campaigns}
      view={view}
      onNavigate={setView}
    >
      {view.type === "home" && (
        <HomeView
          sources={sources}
          campaigns={campaigns}
          onNavigate={setView}
        />
      )}

      {view.type === "source" && (
        <SandboxView
          projectId={view.id}
          tab={view.step}
          onNavigate={setView}
          onProjectUpdated={loadSources}
        />
      )}

      {view.type === "campaign" && (
        <CampaignView
          campaignId={view.id}
          step={view.step}
          sources={sources}
          onNavigate={setView}
          onCampaignCreated={loadCampaigns}
        />
      )}

      {view.type === "warming" && (
        <div className="w-full mx-auto" style={{ padding: "32px 16px", maxWidth: 1024 }}>
          <div style={{ marginBottom: 32 }}>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Email Warming
            </h1>
            <p className="text-muted-foreground" style={{ marginTop: 4 }}>
              Warm up your email domains before sending campaigns
            </p>
          </div>
          <div className="bg-card rounded-12 border border-border shadow-sm" style={{ padding: 24 }}>
            <WarmingPanel />
          </div>
        </div>
      )}

      {view.type === "settings" && (
        <div className="w-full mx-auto" style={{ padding: "32px 16px", maxWidth: 768 }}>
          <div style={{ marginBottom: 32 }}>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Outreach Settings
            </h1>
            <p className="text-muted-foreground" style={{ marginTop: 4 }}>
              Configure your sending backends and email settings
            </p>
          </div>
          <div className="bg-card rounded-12 border border-border shadow-sm" style={{ padding: 24 }}>
            <OutreachSettingsPanel />
          </div>
        </div>
      )}
    </AppLayout>
  );
}
