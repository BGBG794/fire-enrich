"use client";

import { useState } from "react";
import { AppSidebar, type View, type SidebarSource } from "./app-sidebar";
import type { Campaign } from "@/lib/types";
import {
  LayoutDashboard,
  Send,
  Database,
  Flame,
  Settings,
  ChevronRight,
} from "lucide-react";

interface AppLayoutProps {
  sources: SidebarSource[];
  campaigns: Campaign[];
  view: View;
  onNavigate: (view: View) => void;
  children: React.ReactNode;
}

function getViewBreadcrumb(view: View, sources: SidebarSource[], campaigns: Campaign[]) {
  switch (view.type) {
    case "home":
      return { icon: LayoutDashboard, label: "Dashboard" };
    case "campaign": {
      const campaign = campaigns.find((c) => c.id === view.id);
      return {
        icon: Send,
        label: campaign ? campaign.name : "New Campaign",
        parent: "Campaigns",
      };
    }
    case "source": {
      const source = sources.find((s) => s.id === view.id);
      return {
        icon: Database,
        label: source ? source.name : "Import CSV",
        parent: "Data Sources",
      };
    }
    case "warming":
      return { icon: Flame, label: "Warming" };
    case "settings":
      return { icon: Settings, label: "Settings" };
  }
}

export function AppLayout({
  sources,
  campaigns,
  view,
  onNavigate,
  children,
}: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const breadcrumb = getViewBreadcrumb(view, sources, campaigns);
  const Icon = breadcrumb.icon;

  return (
    <div className="flex" style={{ minHeight: "100vh" }}>
      <AppSidebar
        sources={sources}
        campaigns={campaigns}
        view={view}
        onNavigate={onNavigate}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header
          className="flex items-center border-b border-border bg-card"
          style={{ height: 64, padding: "0 32px", gap: 12, flexShrink: 0 }}
        >
          <Icon size={16} className="text-muted-foreground" style={{ flexShrink: 0 }} />
          {breadcrumb.parent && (
            <>
              <span className="text-muted-foreground" style={{ fontSize: 13 }}>
                {breadcrumb.parent}
              </span>
              <ChevronRight size={14} className="text-muted-foreground" style={{ opacity: 0.5 }} />
            </>
          )}
          <span className="text-foreground" style={{ fontSize: 13, fontWeight: 500 }}>
            {breadcrumb.label}
          </span>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
