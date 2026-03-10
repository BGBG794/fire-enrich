"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Sequence, SendingBackend } from "@/lib/types";
import { Rocket, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CampaignBuilderProps {
  projectId: string;
  sequences: Sequence[];
  totalRows: number;
  emailFieldOptions: string[];
  onLaunch: (campaignId: string) => void;
}

export function CampaignBuilder({
  projectId,
  sequences,
  totalRows,
  emailFieldOptions,
  onLaunch,
}: CampaignBuilderProps) {
  const [name, setName] = useState("My Campaign");
  const [sequenceId, setSequenceId] = useState(sequences[0]?.id ?? "");
  const [backend, setBackend] = useState<SendingBackend>("smtp");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [emailField, setEmailField] = useState(emailFieldOptions[0] ?? "");
  const [requireEmail, setRequireEmail] = useState(true);
  const [launching, setLaunching] = useState(false);

  const handleLaunch = async () => {
    if (!sequenceId) {
      toast.error("Select a sequence");
      return;
    }
    if (!senderEmail || !senderName) {
      toast.error("Sender email and name are required");
      return;
    }
    if (!emailField) {
      toast.error("Select which field contains recipient emails");
      return;
    }

    setLaunching(true);
    try {
      // Create the campaign
      const res = await fetch("/api/outreach/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name,
          sequenceId,
          sendingBackend: backend,
          senderEmail,
          senderName,
          replyToEmail: replyTo || undefined,
          rowFilter: {
            requireEmail,
            emailFieldName: emailField,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create campaign");
      }

      toast.success("Campaign created! Launching...");
      onLaunch(data.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create campaign",
      );
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {sequences.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">
            Create a sequence first before launching a campaign.
          </p>
        </div>
      ) : (
        <>
          {/* Campaign name */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              Campaign Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          {/* Sequence selection */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              Sequence
            </label>
            <select
              value={sequenceId}
              onChange={(e) => setSequenceId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
            >
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.steps.length} step{s.steps.length > 1 ? "s" : ""})
                </option>
              ))}
            </select>
          </div>

          {/* Sending backend */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              Sending Backend
            </label>
            <div className="flex gap-2">
              {(["smtp", "billionmail"] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBackend(b)}
                  className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                    backend === b
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-card text-foreground border-border hover:border-orange-300"
                  }`}
                >
                  {b === "smtp" ? "SMTP" : "BillionMail"}
                </button>
              ))}
            </div>
          </div>

          {/* Sender config */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Sender Email
              </label>
              <input
                type="email"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Sender Name
              </label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="Your Name"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              Reply-To (optional)
            </label>
            <input
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="reply@company.com"
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          {/* Recipient config */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              Recipient Email Field
            </label>
            <select
              value={emailField}
              onChange={(e) => setEmailField(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
            >
              <option value="">Select field containing emails...</option>
              {emailFieldOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="requireEmail"
                checked={requireEmail}
                onChange={(e) => setRequireEmail(e.target.checked)}
                className="rounded border-border"
              />
              <label
                htmlFor="requireEmail"
                className="text-xs text-muted-foreground"
              >
                Only send to rows with a valid email ({totalRows} rows total)
              </label>
            </div>
          </div>

          {/* Launch button */}
          <Button
            onClick={handleLaunch}
            disabled={launching || !sequenceId || !senderEmail || !senderName}
            variant="orange"
            className="flex items-center gap-2"
          >
            {launching ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Rocket size={16} />
                Launch Campaign
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
