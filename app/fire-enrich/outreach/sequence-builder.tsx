"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { EmailTemplate, FollowUpCondition, SequenceStep } from "@/lib/types";
import { Plus, Trash2, ArrowDown, Save } from "lucide-react";
import { toast } from "sonner";

type StepDraft = Omit<SequenceStep, "id" | "sequenceId">;

interface SequenceBuilderProps {
  projectId: string;
  templates: EmailTemplate[];
  onSave: () => void;
}

const CONDITIONS: { value: FollowUpCondition; label: string }[] = [
  { value: "ALL", label: "All recipients" },
  { value: "NOT_RESPONDED", label: "Not responded" },
  { value: "RESPONDED", label: "Responded" },
  { value: "NOT_OPENED", label: "Not opened" },
  { value: "OPENED", label: "Opened" },
  { value: "NOT_CLICKED", label: "Not clicked" },
  { value: "CLICKED", label: "Clicked" },
];

export function SequenceBuilder({
  projectId,
  templates,
  onSave,
}: SequenceBuilderProps) {
  const [name, setName] = useState("My Sequence");
  const [steps, setSteps] = useState<StepDraft[]>([
    {
      order: 0,
      templateId: templates[0]?.id ?? "",
      delayDays: 0,
      delayHours: 0,
      condition: "ALL",
    },
  ]);
  const [saving, setSaving] = useState(false);

  const addStep = () => {
    setSteps([
      ...steps,
      {
        order: steps.length,
        templateId: templates[0]?.id ?? "",
        delayDays: 3,
        delayHours: 0,
        condition: "NOT_RESPONDED",
      },
    ]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) return;
    const newSteps = steps
      .filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, order: i }));
    setSteps(newSteps);
  };

  const updateStep = (index: number, updates: Partial<StepDraft>) => {
    setSteps(steps.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Sequence name is required");
      return;
    }
    if (steps.some((s) => !s.templateId)) {
      toast.error("Each step must have a template selected");
      return;
    }
    if (templates.length === 0) {
      toast.error("Create at least one template first");
      return;
    }

    setSaving(true);
    try {
      await fetch("/api/outreach/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, name, steps }),
      });
      toast.success("Sequence created");
      onSave();
    } catch {
      toast.error("Failed to save sequence");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Sequence name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500 w-full max-w-md"
      />

      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={index}>
            {/* Delay indicator between steps */}
            {index > 0 && (
              <div className="flex items-center gap-2 py-2 pl-6">
                <ArrowDown size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Wait</span>
                <input
                  type="number"
                  min={0}
                  value={step.delayDays}
                  onChange={(e) =>
                    updateStep(index, {
                      delayDays: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-14 px-2 py-1 text-xs rounded border border-border bg-card text-foreground"
                />
                <span className="text-xs text-muted-foreground">days</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={step.delayHours}
                  onChange={(e) =>
                    updateStep(index, {
                      delayHours: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-14 px-2 py-1 text-xs rounded border border-border bg-card text-foreground"
                />
                <span className="text-xs text-muted-foreground">hours</span>
                <span className="text-xs text-muted-foreground mx-1">then send to</span>
                <select
                  value={step.condition}
                  onChange={(e) =>
                    updateStep(index, {
                      condition: e.target.value as FollowUpCondition,
                    })
                  }
                  className="px-2 py-1 text-xs rounded border border-border bg-card text-foreground"
                >
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Step card */}
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
              <div className="w-8 h-8 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {index + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-1">
                  {index === 0 ? "Initial email" : `Follow-up #${index}`}
                </div>
                <select
                  value={step.templateId}
                  onChange={(e) =>
                    updateStep(index, { templateId: e.target.value })
                  }
                  className="w-full px-2 py-1.5 text-sm rounded border border-border bg-accent/30 text-foreground"
                >
                  <option value="">Select template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {steps.length > 1 && (
                <button
                  onClick={() => removeStep(index)}
                  className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          onClick={addStep}
          variant="outline"
          size="sm"
          className="flex items-center gap-1.5"
          disabled={templates.length === 0}
        >
          <Plus size={14} /> Add Follow-up
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || templates.length === 0}
          size="sm"
          variant="orange"
          className="flex items-center gap-1.5"
        >
          <Save size={14} />
          {saving ? "Saving..." : "Save Sequence"}
        </Button>
      </div>

      {templates.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Create at least one email template first before building a sequence.
        </p>
      )}
    </div>
  );
}
