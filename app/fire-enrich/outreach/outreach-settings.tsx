"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { OutreachSettings, SendingBackend } from "@/lib/types";
import { Save, Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

export function OutreachSettingsPanel() {
  const [settings, setSettings] = useState<OutreachSettings>({
    defaultBackend: "smtp",
    dailySendLimit: 200,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/outreach/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.defaultBackend) setSettings(data);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/outreach/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/outreach/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backend: settings.defaultBackend,
          smtp: settings.smtp,
          billionmail: settings.billionmail,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, message: "Connection test failed" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      {/* Backend toggle */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-2">
          Default Sending Backend
        </label>
        <div className="flex gap-2">
          {(["smtp", "billionmail"] as SendingBackend[]).map((b) => (
            <button
              key={b}
              onClick={() =>
                setSettings({ ...settings, defaultBackend: b })
              }
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                settings.defaultBackend === b
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-card text-foreground border-border hover:border-orange-300"
              }`}
            >
              {b === "smtp" ? "SMTP" : "BillionMail"}
            </button>
          ))}
        </div>
      </div>

      {/* SMTP Config */}
      {settings.defaultBackend === "smtp" && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">
            SMTP Configuration
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Host</label>
              <input
                type="text"
                value={settings.smtp?.host ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    smtp: { ...settings.smtp!, host: e.target.value },
                  })
                }
                placeholder="smtp.gmail.com"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Port</label>
              <input
                type="number"
                value={settings.smtp?.port ?? 587}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    smtp: {
                      ...settings.smtp!,
                      port: parseInt(e.target.value) || 587,
                    },
                  })
                }
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Username</label>
            <input
              type="text"
              value={settings.smtp?.username ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  smtp: { ...settings.smtp!, username: e.target.value },
                })
              }
              placeholder="user@example.com"
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Password</label>
            <input
              type="password"
              value={settings.smtp?.password ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  smtp: { ...settings.smtp!, password: e.target.value },
                })
              }
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={settings.smtp?.secure ?? false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  smtp: { ...settings.smtp!, secure: e.target.checked },
                })
              }
              className="rounded border-border"
            />
            Use TLS/SSL
          </label>
        </div>
      )}

      {/* BillionMail Config */}
      {settings.defaultBackend === "billionmail" && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">
            BillionMail Configuration
          </h4>
          <div>
            <label className="text-xs text-muted-foreground">Base URL</label>
            <input
              type="text"
              value={settings.billionmail?.baseUrl ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  billionmail: {
                    ...settings.billionmail!,
                    baseUrl: e.target.value,
                  },
                })
              }
              placeholder="http://localhost:8025"
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">API Key</label>
            <input
              type="password"
              value={settings.billionmail?.apiKey ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  billionmail: {
                    ...settings.billionmail!,
                    apiKey: e.target.value,
                  },
                })
              }
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>
      )}

      {/* Daily limit */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1">
          Daily Send Limit
        </label>
        <input
          type="number"
          value={settings.dailySendLimit}
          onChange={(e) =>
            setSettings({
              ...settings,
              dailySendLimit: parseInt(e.target.value) || 200,
            })
          }
          min={1}
          className="w-32 px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 items-center">
        <Button
          onClick={handleSave}
          disabled={saving}
          variant="orange"
          size="sm"
          className="flex items-center gap-1.5"
        >
          <Save size={14} />
          {saving ? "Saving..." : "Save Settings"}
        </Button>
        <Button
          onClick={handleTest}
          disabled={testing}
          variant="outline"
          size="sm"
          className="flex items-center gap-1.5"
        >
          {testing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : testResult?.success ? (
            <CheckCircle size={14} className="text-green-500" />
          ) : testResult ? (
            <XCircle size={14} className="text-red-500" />
          ) : null}
          Test Connection
        </Button>
        {testResult && (
          <span
            className={`text-xs ${testResult.success ? "text-green-500" : "text-red-500"}`}
          >
            {testResult.message}
          </span>
        )}
      </div>
    </div>
  );
}
