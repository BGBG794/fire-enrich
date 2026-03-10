"use client";

import type { Campaign } from "@/lib/types";
import type { SidebarSource, View } from "./app-sidebar";
import {
  Send,
  Database,
  Users,
  Mail,
  Plus,
  ArrowRight,
  CheckCircle,
  Loader2,
  Flame,
  TrendingUp,
} from "lucide-react";

interface HomeViewProps {
  sources: SidebarSource[];
  campaigns: Campaign[];
  onNavigate: (view: View) => void;
}

export function HomeView({ sources, campaigns, onNavigate }: HomeViewProps) {
  const completedSources = sources.filter((s) => s.status === "completed").length;
  const activeCampaigns = campaigns.filter(
    (c) => c.status === "running" || c.status === "scheduled"
  ).length;
  const totalContacts = sources.reduce((sum, s) => sum + s.rowCount, 0);
  const totalSent = campaigns.reduce(
    (sum, c) => sum + (c.stats?.sent || 0),
    0
  );

  return (
    <div style={{ padding: "32px 16px" }} className="w-full mx-auto sm:px-24 lg:px-32">
      {/* Welcome */}
      <div style={{ marginBottom: 32 }}>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          Dashboard
        </h1>
        <p className="text-muted-foreground" style={{ marginTop: 4 }}>
          Overview of your enrichment sources and outreach campaigns
        </p>
      </div>

      {/* Stats cards - 12-column grid */}
      <div className="grid grid-cols-12" style={{ gap: 24, marginBottom: 32 }}>
        {/* Sources */}
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <div className="bg-card rounded-12 border border-border shadow-sm" style={{ padding: 20 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <div className="flex items-center justify-center rounded-8 bg-orange-500/10" style={{ width: 40, height: 40 }}>
                <Database size={20} className="text-orange-500" />
              </div>
              {completedSources > 0 && (
                <span className="text-xs font-medium text-emerald-500 flex items-center" style={{ gap: 4 }}>
                  <TrendingUp size={12} />
                  {completedSources} done
                </span>
              )}
            </div>
            <div>
              <h3 className="text-3xl font-bold text-foreground">{sources.length}</h3>
              <p className="text-sm text-muted-foreground" style={{ marginTop: 4 }}>Data Sources</p>
            </div>
          </div>
        </div>

        {/* Campaigns */}
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <div className="bg-card rounded-12 border border-border shadow-sm" style={{ padding: 20 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <div className="flex items-center justify-center rounded-8 bg-blue-500/10" style={{ width: 40, height: 40 }}>
                <Send size={20} className="text-blue-500" />
              </div>
              {activeCampaigns > 0 && (
                <span className="text-xs font-medium text-emerald-500 flex items-center" style={{ gap: 4 }}>
                  <TrendingUp size={12} />
                  {activeCampaigns} active
                </span>
              )}
            </div>
            <div>
              <h3 className="text-3xl font-bold text-foreground">{campaigns.length}</h3>
              <p className="text-sm text-muted-foreground" style={{ marginTop: 4 }}>Campaigns</p>
            </div>
          </div>
        </div>

        {/* Contacts */}
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <div className="bg-card rounded-12 border border-border shadow-sm" style={{ padding: 20 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <div className="flex items-center justify-center rounded-8 bg-violet-500/10" style={{ width: 40, height: 40 }}>
                <Users size={20} className="text-violet-500" />
              </div>
            </div>
            <div>
              <h3 className="text-3xl font-bold text-foreground">
                {totalContacts.toLocaleString()}
              </h3>
              <p className="text-sm text-muted-foreground" style={{ marginTop: 4 }}>Total Contacts</p>
            </div>
          </div>
        </div>

        {/* Emails Sent */}
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <div className="bg-card rounded-12 border border-border shadow-sm" style={{ padding: 20 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <div className="flex items-center justify-center rounded-8 bg-emerald-500/10" style={{ width: 40, height: 40 }}>
                <Mail size={20} className="text-emerald-500" />
              </div>
            </div>
            <div>
              <h3 className="text-3xl font-bold text-foreground">
                {totalSent.toLocaleString()}
              </h3>
              <p className="text-sm text-muted-foreground" style={{ marginTop: 4 }}>Emails Sent</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions + Recent activity - 12-column grid */}
      <div className="grid grid-cols-12" style={{ gap: 24 }}>
        {/* Quick Actions */}
        <div className="col-span-12 lg:col-span-4">
          <div className="bg-card rounded-12 border border-border shadow-sm" style={{ padding: 20 }}>
            <h2 className="text-base font-semibold text-foreground" style={{ marginBottom: 16 }}>
              Quick Actions
            </h2>
            <div className="flex flex-col" style={{ gap: 12 }}>
              <button
                onClick={() => onNavigate({ type: "source", id: null, step: "import" })}
                className="flex items-center rounded-8 bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/10 transition-colors text-left group"
                style={{ gap: 12, padding: 12 }}
              >
                <div className="flex items-center justify-center rounded-8 bg-orange-500 text-white shadow-sm" style={{ width: 36, height: 36 }}>
                  <Plus size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Import CSV</p>
                  <p className="text-xs text-muted-foreground">
                    Upload and enrich data
                  </p>
                </div>
                <ArrowRight size={14} className="text-muted-foreground" />
              </button>

              <button
                onClick={() => onNavigate({ type: "campaign", id: null, step: "contacts" })}
                className="flex items-center rounded-8 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 transition-colors text-left group"
                style={{ gap: 12, padding: 12 }}
              >
                <div className="flex items-center justify-center rounded-8 bg-blue-500 text-white shadow-sm" style={{ width: 36, height: 36 }}>
                  <Send size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">New Campaign</p>
                  <p className="text-xs text-muted-foreground">
                    Create outreach campaign
                  </p>
                </div>
                <ArrowRight size={14} className="text-muted-foreground" />
              </button>

              <button
                onClick={() => onNavigate({ type: "warming" })}
                className="flex items-center rounded-8 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 transition-colors text-left group"
                style={{ gap: 12, padding: 12 }}
              >
                <div className="flex items-center justify-center rounded-8 bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-sm" style={{ width: 36, height: 36 }}>
                  <Flame size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Email Warming</p>
                  <p className="text-xs text-muted-foreground">
                    Warm up domains
                  </p>
                </div>
                <ArrowRight size={14} className="text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>

        {/* Recent Sources */}
        <div className="col-span-12 lg:col-span-4">
          <div className="bg-card rounded-12 border border-border shadow-sm" style={{ padding: 20 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <h2 className="text-base font-semibold text-foreground">
                Recent Sources
              </h2>
              <button
                onClick={() => onNavigate({ type: "source", id: null, step: "import" })}
                className="text-xs text-orange-500 hover:text-orange-600 font-medium"
              >
                View All
              </button>
            </div>
            {sources.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center" style={{ padding: "16px 0" }}>
                No sources yet. Import a CSV to get started.
              </p>
            ) : (
              <div className="flex flex-col" style={{ gap: 4 }}>
                {sources.slice(0, 5).map((source) => (
                  <button
                    key={source.id}
                    onClick={() =>
                      onNavigate({
                        type: "source",
                        id: source.id,
                        step: source.status === "draft" ? "configure" : "results",
                      })
                    }
                    className="flex items-center rounded-8 hover:bg-accent transition-colors text-left"
                    style={{ gap: 12, padding: 10, margin: "0 -4px" }}
                  >
                    <Database size={14} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{source.name}</p>
                      <p style={{ fontSize: 11 }} className="text-muted-foreground">
                        {source.rowCount} rows
                      </p>
                    </div>
                    <div className="shrink-0">
                      {source.status === "completed" ? (
                        <span className="flex items-center text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-full font-medium" style={{ fontSize: 10, gap: 4, padding: "2px 8px" }}>
                          <CheckCircle size={10} />
                          Done
                        </span>
                      ) : source.status === "enriching" ? (
                        <span className="flex items-center text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-full font-medium" style={{ fontSize: 10, gap: 4, padding: "2px 8px" }}>
                          <Loader2 size={10} className="animate-spin" />
                          Active
                        </span>
                      ) : (
                        <span className="text-muted-foreground bg-accent rounded-full font-medium" style={{ fontSize: 10, padding: "2px 8px" }}>
                          Draft
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Campaigns */}
        <div className="col-span-12 lg:col-span-4">
          <div className="bg-card rounded-12 border border-border shadow-sm" style={{ padding: 20 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <h2 className="text-base font-semibold text-foreground">
                Recent Campaigns
              </h2>
              <button
                onClick={() => onNavigate({ type: "campaign", id: null, step: "contacts" })}
                className="text-xs text-orange-500 hover:text-orange-600 font-medium"
              >
                New
              </button>
            </div>
            {campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center" style={{ padding: "16px 0" }}>
                No campaigns yet. Create one to start outreach.
              </p>
            ) : (
              <div className="flex flex-col" style={{ gap: 4 }}>
                {campaigns.slice(0, 5).map((campaign) => (
                  <button
                    key={campaign.id}
                    onClick={() =>
                      onNavigate({
                        type: "campaign",
                        id: campaign.id,
                        step: "analytics",
                      })
                    }
                    className="flex items-center rounded-8 hover:bg-accent transition-colors text-left"
                    style={{ gap: 12, padding: 10, margin: "0 -4px" }}
                  >
                    <Send size={14} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{campaign.name}</p>
                      <p style={{ fontSize: 11 }} className="text-muted-foreground">
                        {campaign.stats?.sent || 0} sent · {campaign.status}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
