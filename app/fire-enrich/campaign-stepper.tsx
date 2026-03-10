"use client";

import type { LucideIcon } from "lucide-react";

export interface StepDef {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface CampaignStepperProps {
  steps: StepDef[];
  activeStep: string;
  onStepClick: (stepId: string) => void;
}

export function CampaignStepper({
  steps,
  activeStep,
  onStepClick,
}: CampaignStepperProps) {
  const activeIndex = steps.findIndex((s) => s.id === activeStep);

  return (
    <div className="flex items-center" style={{ gap: 4 }}>
      {steps.map(({ id, label, icon: Icon }, index) => {
        const isActive = activeStep === id;
        const isPast = index < activeIndex;

        return (
          <button
            key={id}
            onClick={() => onStepClick(id)}
            className={`flex items-center rounded-8 text-sm font-medium transition-all ${
              isActive
                ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                : isPast
                  ? "text-foreground hover:bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            style={{ padding: "8px 16px", gap: 8 }}
          >
            <div
              className={`flex items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-orange-500 text-white"
                  : isPast
                    ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    : "bg-accent text-muted-foreground"
              }`}
              style={{ width: 24, height: 24 }}
            >
              {isPast ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                index + 1
              )}
            </div>
            {label}
          </button>
        );
      })}
    </div>
  );
}
