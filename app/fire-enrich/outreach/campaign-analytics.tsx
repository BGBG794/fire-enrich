"use client";

import { useState, useEffect } from "react";
import type { Campaign, CampaignStats, EmailSend } from "@/lib/types";
import { RefreshCw, Mail, MousePointerClick, Eye, MessageSquare, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CampaignAnalyticsProps {
  campaign: Campaign;
}

export function CampaignAnalytics({ campaign }: CampaignAnalyticsProps) {
  const [stats, setStats] = useState<CampaignStats | null>(campaign.stats ?? null);
  const [sends, setSends] = useState<EmailSend[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshStats = async () => {
    setLoading(true);
    try {
      const [statsRes, sendsRes] = await Promise.all([
        fetch(`/api/outreach/campaigns/${campaign.id}/stats`),
        fetch(`/api/outreach/campaigns/${campaign.id}/sends`),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (sendsRes.ok) setSends(await sendsRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshStats();
  }, [campaign.id]);

  const statCards = [
    { label: "Sent", value: stats?.sent ?? 0, icon: Mail, color: "text-blue-500" },
    { label: "Opened", value: stats?.opened ?? 0, icon: Eye, color: "text-green-500", rate: stats?.openRate },
    { label: "Clicked", value: stats?.clicked ?? 0, icon: MousePointerClick, color: "text-purple-500", rate: stats?.clickRate },
    { label: "Replied", value: stats?.replied ?? 0, icon: MessageSquare, color: "text-orange-500", rate: stats?.replyRate },
    { label: "Bounced", value: stats?.bounced ?? 0, icon: AlertTriangle, color: "text-red-500", rate: stats?.bounceRate },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {campaign.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            Status: <span className="capitalize">{campaign.status}</span>
            {campaign.startedAt && (
              <> — Started {new Date(campaign.startedAt).toLocaleDateString()}</>
            )}
          </p>
        </div>
        <Button
          onClick={refreshStats}
          variant="outline"
          size="sm"
          disabled={loading}
          className="flex items-center gap-1.5"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-5 gap-3">
        {statCards.map(({ label, value, icon: Icon, color, rate }) => (
          <div
            key={label}
            className="p-3 rounded-lg border border-border bg-card"
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} className={color} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <div className="text-xl font-bold text-foreground">{value}</div>
            {rate !== undefined && (
              <div className="text-xs text-muted-foreground">{rate}%</div>
            )}
          </div>
        ))}
      </div>

      {/* Funnel bar */}
      {stats && stats.sent > 0 && (
        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-xs font-semibold text-muted-foreground mb-2">
            Funnel
          </div>
          <div className="space-y-1.5">
            {[
              { label: "Sent", value: stats.sent, color: "bg-blue-500" },
              { label: "Opened", value: stats.opened, color: "bg-green-500" },
              { label: "Clicked", value: stats.clicked, color: "bg-purple-500" },
              { label: "Replied", value: stats.replied, color: "bg-orange-500" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16">{label}</span>
                <div className="flex-1 h-5 rounded bg-accent/50 overflow-hidden">
                  <div
                    className={`h-full ${color} rounded transition-all duration-500`}
                    style={{
                      width: `${stats.sent > 0 ? (value / stats.sent) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-foreground w-8 text-right">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-recipient table */}
      {sends.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="text-xs font-semibold text-muted-foreground p-2 bg-accent/30">
            Email Sends ({sends.length})
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-accent/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 text-muted-foreground font-medium">
                    Email
                  </th>
                  <th className="text-left p-2 text-muted-foreground font-medium">
                    Status
                  </th>
                  <th className="text-left p-2 text-muted-foreground font-medium">
                    Sent
                  </th>
                  <th className="text-left p-2 text-muted-foreground font-medium">
                    Opened
                  </th>
                  <th className="text-left p-2 text-muted-foreground font-medium">
                    Clicked
                  </th>
                </tr>
              </thead>
              <tbody>
                {sends.map((send) => (
                  <tr
                    key={send.id}
                    className="border-t border-border hover:bg-accent/20"
                  >
                    <td className="p-2 text-foreground">{send.recipientEmail}</td>
                    <td className="p-2">
                      <span
                        className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          send.status === "sent" || send.status === "delivered"
                            ? "bg-green-500/10 text-green-500"
                            : send.status === "failed"
                              ? "bg-red-500/10 text-red-500"
                              : send.status === "opened"
                                ? "bg-blue-500/10 text-blue-500"
                                : "bg-gray-500/10 text-gray-500"
                        }`}
                      >
                        {send.status}
                      </span>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {send.sentAt
                        ? new Date(send.sentAt).toLocaleString()
                        : "-"}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {send.openedAt
                        ? new Date(send.openedAt).toLocaleString()
                        : "-"}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {send.clickedAt
                        ? new Date(send.clickedAt).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
