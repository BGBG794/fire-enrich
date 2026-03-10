"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import type { WarmingAccount, WarmingLog, SendingBackend } from "@/lib/types";
import {
  Flame,
  Plus,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Loader2,
  CheckCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface AccountWithLogs extends WarmingAccount {
  logs?: WarmingLog[];
}

export function WarmingPanel() {
  const [accounts, setAccounts] = useState<AccountWithLogs[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    backend: "smtp" as SendingBackend,
    smtpHost: "",
    smtpPort: 587,
    smtpUsername: "",
    smtpPassword: "",
    smtpSecure: false,
    dailyTarget: 50,
    totalDays: 28,
  });
  const [saving, setSaving] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/outreach/warming");
      if (res.ok) {
        const list: WarmingAccount[] = await res.json();
        // Load logs for each account
        const withLogs = await Promise.all(
          list.map(async (a) => {
            const detailRes = await fetch(`/api/outreach/warming/${a.id}`);
            if (detailRes.ok) return detailRes.json();
            return { ...a, logs: [] };
          })
        );
        setAccounts(withLogs);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    const interval = setInterval(loadAccounts, 30_000);
    return () => clearInterval(interval);
  }, [loadAccounts]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        email: formData.email,
        name: formData.name,
        backend: formData.backend,
        dailyTarget: formData.dailyTarget,
        totalDays: formData.totalDays,
      };
      if (formData.backend === "smtp") {
        body.smtp = {
          host: formData.smtpHost,
          port: formData.smtpPort,
          username: formData.smtpUsername,
          password: formData.smtpPassword,
          secure: formData.smtpSecure,
        };
      }
      const res = await fetch("/api/outreach/warming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success("Account added");
        setShowForm(false);
        setFormData({
          email: "",
          name: "",
          backend: "smtp",
          smtpHost: "",
          smtpPort: 587,
          smtpUsername: "",
          smtpPassword: "",
          smtpSecure: false,
          dailyTarget: 50,
          totalDays: 28,
        });
        loadAccounts();
      }
    } catch {
      toast.error("Failed to create account");
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (id: string, action: "start" | "pause" | "resume") => {
    await fetch(`/api/outreach/warming/${id}/${action}`, { method: "POST" });
    loadAccounts();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/outreach/warming/${id}`, { method: "DELETE" });
    toast.success("Account removed");
    loadAccounts();
  };

  const getStatusBadge = (status: WarmingAccount["status"]) => {
    switch (status) {
      case "warming":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-orange-500/20 text-orange-500">
            <Flame size={10} />
            Warming
          </span>
        );
      case "paused":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-yellow-500/20 text-yellow-600 dark:text-yellow-400">
            <Pause size={10} />
            Paused
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-green-500/20 text-green-600 dark:text-green-400">
            <CheckCircle size={10} />
            Completed
          </span>
        );
      default:
        return (
          <span className="inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full bg-accent text-muted-foreground">
            Idle
          </span>
        );
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 50) return "text-yellow-500";
    return "text-red-500";
  };

  const getDayQuota = (day: number, target: number) => {
    return Math.min(Math.floor(5 * Math.pow(1.15, day)), target);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Email Warming
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gradually warm up sender accounts to build email reputation
          </p>
        </div>
        <Button
          variant="orange"
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5"
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Cancel" : "Add Account"}
        </Button>
      </div>

      {/* Add account form */}
      {showForm && (
        <div className="p-4 rounded-lg border border-border bg-card space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="sender@example.com"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Display Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="John Doe"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </div>

          {/* Backend */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Backend
            </label>
            <div className="flex gap-2">
              {(["smtp", "billionmail"] as SendingBackend[]).map((b) => (
                <button
                  key={b}
                  onClick={() => setFormData({ ...formData, backend: b })}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    formData.backend === b
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-card text-foreground border-border hover:border-orange-300"
                  }`}
                >
                  {b === "smtp" ? "SMTP" : "BillionMail"}
                </button>
              ))}
            </div>
          </div>

          {/* SMTP config */}
          {formData.backend === "smtp" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">
                  SMTP Host
                </label>
                <input
                  type="text"
                  value={formData.smtpHost}
                  onChange={(e) =>
                    setFormData({ ...formData, smtpHost: e.target.value })
                  }
                  placeholder="smtp.gmail.com"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Port</label>
                <input
                  type="number"
                  value={formData.smtpPort}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      smtpPort: parseInt(e.target.value) || 587,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Username
                </label>
                <input
                  type="text"
                  value={formData.smtpUsername}
                  onChange={(e) =>
                    setFormData({ ...formData, smtpUsername: e.target.value })
                  }
                  placeholder="user@example.com"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Password
                </label>
                <input
                  type="password"
                  value={formData.smtpPassword}
                  onChange={(e) =>
                    setFormData({ ...formData, smtpPassword: e.target.value })
                  }
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground col-span-2">
                <input
                  type="checkbox"
                  checked={formData.smtpSecure}
                  onChange={(e) =>
                    setFormData({ ...formData, smtpSecure: e.target.checked })
                  }
                  className="rounded border-border"
                />
                Use TLS/SSL
              </label>
            </div>
          )}

          {/* Warming params */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">
                Duration (days)
              </label>
              <input
                type="number"
                value={formData.totalDays}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    totalDays: parseInt(e.target.value) || 28,
                  })
                }
                min={7}
                max={90}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Max emails/day target
              </label>
              <input
                type="number"
                value={formData.dailyTarget}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    dailyTarget: parseInt(e.target.value) || 50,
                  })
                }
                min={5}
                max={500}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </div>

          <Button
            variant="orange"
            size="sm"
            onClick={handleCreate}
            disabled={saving || !formData.email || !formData.name}
            className="flex items-center gap-1.5"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Add Account
          </Button>
        </div>
      )}

      {/* Account list */}
      {accounts.length === 0 && !showForm ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <Flame size={32} className="mx-auto mb-3 opacity-30" />
          <p>No warming accounts yet.</p>
          <p className="text-xs mt-1">
            Add email accounts to start building sender reputation.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => {
            const quota = getDayQuota(account.currentDay, account.dailyTarget);
            const progressPercent = account.totalDays > 0
              ? Math.round((account.currentDay / account.totalDays) * 100)
              : 0;

            return (
              <div
                key={account.id}
                className="p-4 rounded-lg border border-border bg-card"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {account.email}
                      </span>
                      {getStatusBadge(account.status)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {account.name} · {account.backend.toUpperCase()}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {account.status === "idle" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAction(account.id, "start")}
                        className="h-7 px-2 text-xs"
                      >
                        <Play size={12} className="mr-1" />
                        Start
                      </Button>
                    )}
                    {account.status === "warming" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAction(account.id, "pause")}
                        className="h-7 px-2 text-xs"
                      >
                        <Pause size={12} className="mr-1" />
                        Pause
                      </Button>
                    )}
                    {account.status === "paused" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAction(account.id, "resume")}
                        className="h-7 px-2 text-xs"
                      >
                        <RotateCcw size={12} className="mr-1" />
                        Resume
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(account.id)}
                      className="h-7 px-2 text-xs text-red-500 hover:text-red-400"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Day</div>
                    <div className="text-sm font-semibold text-foreground">
                      {account.currentDay}/{account.totalDays}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Today</div>
                    <div className="text-sm font-semibold text-foreground">
                      {account.emailsSentToday}/{quota}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="text-sm font-semibold text-foreground">
                      {account.totalEmailsSent}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Health</div>
                    <div
                      className={`text-sm font-semibold ${getHealthColor(account.healthScore)}`}
                    >
                      {account.healthScore}%
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 rounded-full bg-accent/50 overflow-hidden mb-2">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {/* Volume chart (mini bars from logs) */}
                {account.logs && account.logs.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs text-muted-foreground mb-1">
                      Daily volume
                    </div>
                    <div className="flex items-end gap-0.5 h-12">
                      {account.logs.map((log) => {
                        const maxSent = Math.max(
                          ...account.logs!.map((l) => l.emailsSent),
                          1
                        );
                        const height = (log.emailsSent / maxSent) * 100;
                        return (
                          <div
                            key={log.id}
                            className="flex-1 bg-orange-500/60 rounded-t-sm min-w-[4px] transition-all"
                            style={{ height: `${Math.max(height, 4)}%` }}
                            title={`Day ${log.day}: ${log.emailsSent} sent`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Bounced warning */}
                {account.totalBounced > 0 && (
                  <div className="text-xs text-red-500 mt-2">
                    {account.totalBounced} bounced emails detected
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
