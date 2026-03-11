"use client";

import { useState } from "react";
import {
  Send,
  Database,
  Flame,
  Settings,
  LayoutDashboard,
  Plus,
  Zap,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { Campaign, CampaignStats } from "@/lib/types";

export type View =
  | { type: "home" }
  | { type: "campaign"; id: string | null; step: "contacts" | "sequences" | "launch" | "analytics" }
  | { type: "source"; id: string | null; step: "data" | "enrich" | "results" }
  | { type: "warming" }
  | { type: "settings" };

export interface SidebarSource {
  id: string;
  name: string;
  rowCount: number;
  status: string;
  createdAt: number;
}

interface AppSidebarProps {
  sources: SidebarSource[];
  campaigns: Campaign[];
  view: View;
  onNavigate: (view: View) => void;
  collapsed: boolean;
  onToggle: () => void;
}

function StatusDot({ status }: { status: string }) {
  if (status === "completed") return <span className="inline-block" style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#10b981" }} />;
  if (status === "enriching" || status === "running") return <span className="inline-block animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#f59e0b" }} />;
  return <span className="inline-block" style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#9ca3af" }} />;
}

function NavItem({
  active,
  onClick,
  icon: Icon,
  label,
  collapsed,
  badge,
  statusDot,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof LayoutDashboard;
  label: string;
  collapsed: boolean;
  badge?: string;
  statusDot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-12 rounded-8 transition-colors ${
        active
          ? "bg-white/10 text-white"
          : "text-[#94a3b8] hover:text-white hover:bg-white/5"
      }`}
      style={{ padding: collapsed ? "8px" : "8px 12px", justifyContent: collapsed ? "center" : "flex-start" }}
    >
      <Icon size={18} style={{ flexShrink: 0 }} />
      {!collapsed && (
        <div className="flex items-center justify-between flex-1 min-w-0">
          <span className="truncate" style={{ fontSize: 13 }}>{label}</span>
          <div className="flex items-center gap-6" style={{ marginLeft: 8, flexShrink: 0 }}>
            {badge && (
              <span style={{ fontSize: 10, color: "#64748b" }} className="tabular-nums">
                {badge}
              </span>
            )}
            {statusDot && <StatusDot status={statusDot} />}
          </div>
        </div>
      )}
    </button>
  );
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div style={{ height: 1, margin: "8px 0", backgroundColor: "rgba(255,255,255,0.08)" }} />;
  return (
    <div style={{ padding: "16px 12px 4px 12px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", color: "#475569" }} className="uppercase">
      {label}
    </div>
  );
}

export function AppSidebar({ sources, campaigns, view, onNavigate, collapsed, onToggle }: AppSidebarProps) {
  return (
    <aside
      className="flex flex-col shrink-0 border-r border-[rgba(255,255,255,0.06)]"
      style={{
        width: collapsed ? 60 : 260,
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
        transition: "width 200ms ease",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center border-b border-[rgba(255,255,255,0.06)]"
        style={{ padding: collapsed ? "16px 12px" : "16px 16px", height: 64, justifyContent: collapsed ? "center" : "flex-start", gap: 12 }}
      >
        <div
          className="flex items-center justify-center shrink-0 rounded-8"
          style={{ width: 32, height: 32, background: "linear-gradient(135deg, #f97316, #ea580c)" }}
        >
          <Zap size={16} color="white" />
        </div>
        {!collapsed && (
          <span style={{ fontSize: 15, fontWeight: 600, color: "white", letterSpacing: "-0.01em" }}>
            Fire Enrich
          </span>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto" style={{ padding: collapsed ? "8px 6px" : "8px 12px" }}>
        {/* Dashboard */}
        <div style={{ marginBottom: 4 }}>
          <NavItem
            active={view.type === "home"}
            onClick={() => onNavigate({ type: "home" })}
            icon={LayoutDashboard}
            label="Dashboard"
            collapsed={collapsed}
          />
        </div>

        {/* Campaigns */}
        <SectionLabel label="Campaigns" collapsed={collapsed} />
        <div className="flex flex-col" style={{ gap: 2 }}>
          {campaigns.map((campaign) => (
            <NavItem
              key={campaign.id}
              active={view.type === "campaign" && view.id === campaign.id}
              onClick={() => onNavigate({ type: "campaign", id: campaign.id, step: "contacts" })}
              icon={Send}
              label={campaign.name}
              collapsed={collapsed}
              badge={String(campaign.stats?.sent || 0)}
              statusDot={campaign.status}
            />
          ))}
          <NavItem
            active={view.type === "campaign" && view.id === null}
            onClick={() => onNavigate({ type: "campaign", id: null, step: "contacts" })}
            icon={Plus}
            label="New Campaign"
            collapsed={collapsed}
          />
        </div>

        {/* Projects */}
        <SectionLabel label="Projects" collapsed={collapsed} />
        <div className="flex flex-col" style={{ gap: 2 }}>
          {sources.map((source) => (
            <NavItem
              key={source.id}
              active={view.type === "source" && view.id === source.id}
              onClick={() =>
                onNavigate({
                  type: "source",
                  id: source.id,
                  step: "data",
                })
              }
              icon={Database}
              label={source.name}
              collapsed={collapsed}
              badge={String(source.rowCount)}
              statusDot={source.status}
            />
          ))}
          <NavItem
            active={view.type === "source" && view.id === null}
            onClick={() => onNavigate({ type: "source", id: null, step: "data" })}
            icon={Plus}
            label="New Project"
            collapsed={collapsed}
          />
        </div>

        {/* Tools */}
        <SectionLabel label="Tools" collapsed={collapsed} />
        <div className="flex flex-col" style={{ gap: 2 }}>
          <NavItem
            active={view.type === "warming"}
            onClick={() => onNavigate({ type: "warming" })}
            icon={Flame}
            label="Warming"
            collapsed={collapsed}
          />
          <NavItem
            active={view.type === "settings"}
            onClick={() => onNavigate({ type: "settings" })}
            icon={Settings}
            label="Settings"
            collapsed={collapsed}
          />
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center border-t border-[rgba(255,255,255,0.06)]"
        style={{ padding: "12px 16px", justifyContent: collapsed ? "center" : "flex-start" }}
      >
        <button
          onClick={onToggle}
          className="text-[#475569] hover:text-white transition-colors"
          style={{ padding: 4 }}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
    </aside>
  );
}
