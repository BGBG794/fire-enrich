"use client";

import { useState } from "react";
import { nanoid } from "nanoid";
import {
  Plus,
  Trash2,
  GripVertical,
  Globe,
  Brain,
  Users,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import type {
  PipelineStep,
  PipelineConfig,
  PipelineStepType,
  EnrichmentField,
} from "@/lib/types";

interface PipelineBuilderProps {
  columns: string[];
  onStartPipeline: (config: PipelineConfig) => void;
}

const STEP_TYPE_INFO: Record<
  PipelineStepType,
  { label: string; description: string; icon: typeof Globe; color: string }
> = {
  web_research: {
    label: "Web Research",
    description: "Search the web and extract data with AI (like Claygent)",
    icon: Globe,
    color: "text-blue-600 bg-blue-50 border-blue-200",
  },
  ai_analysis: {
    label: "AI Analysis",
    description: "Analyze accumulated data with AI only (like Use AI)",
    icon: Brain,
    color: "text-purple-600 bg-purple-50 border-purple-200",
  },
  contact_search: {
    label: "Contact Search",
    description: "Find LinkedIn profiles and emails",
    icon: Users,
    color: "text-green-600 bg-green-50 border-green-200",
  },
};

function createDefaultStep(order: number): PipelineStep {
  return {
    id: nanoid(),
    order,
    name: "",
    type: "web_research",
    prompt: "",
    outputFields: [
      {
        name: "",
        displayName: "",
        description: "",
        type: "string",
        required: false,
      },
    ],
    inputColumns: [],
    usePreviousSteps: true,
  };
}

export function PipelineBuilder({
  columns,
  onStartPipeline,
}: PipelineBuilderProps) {
  const [identifierColumn, setIdentifierColumn] = useState<string>(
    columns[0] || ""
  );
  const [steps, setSteps] = useState<PipelineStep[]>([
    createDefaultStep(0),
  ]);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(
    new Set([steps[0].id])
  );

  const toggleStep = (id: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const addStep = () => {
    const newStep = createDefaultStep(steps.length);
    setSteps((prev) => [...prev, newStep]);
    setExpandedSteps((prev) => new Set([...prev, newStep.id]));
  };

  const removeStep = (id: string) => {
    setSteps((prev) =>
      prev
        .filter((s) => s.id !== id)
        .map((s, i) => ({ ...s, order: i }))
    );
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const updateStep = (id: string, updates: Partial<PipelineStep>) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const moveStep = (id: string, direction: "up" | "down") => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (
        (direction === "up" && idx === 0) ||
        (direction === "down" && idx === prev.length - 1)
      ) {
        return prev;
      }
      const newSteps = [...prev];
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      [newSteps[idx], newSteps[swapIdx]] = [newSteps[swapIdx], newSteps[idx]];
      return newSteps.map((s, i) => ({ ...s, order: i }));
    });
  };

  const addOutputField = (stepId: string) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== stepId) return s;
        return {
          ...s,
          outputFields: [
            ...s.outputFields,
            {
              name: "",
              displayName: "",
              description: "",
              type: "string" as const,
              required: false,
            },
          ],
        };
      })
    );
  };

  const updateOutputField = (
    stepId: string,
    fieldIndex: number,
    updates: Partial<EnrichmentField>
  ) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== stepId) return s;
        const newFields = [...s.outputFields];
        newFields[fieldIndex] = { ...newFields[fieldIndex], ...updates };
        // Auto-generate name from displayName
        if (updates.displayName !== undefined) {
          newFields[fieldIndex].name = updates.displayName
            .replace(/[^a-zA-Z0-9\s]/g, "")
            .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
            .replace(/^\w/, (c) => c.toLowerCase());
        }
        return { ...s, outputFields: newFields };
      })
    );
  };

  const removeOutputField = (stepId: string, fieldIndex: number) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== stepId) return s;
        return {
          ...s,
          outputFields: s.outputFields.filter((_, i) => i !== fieldIndex),
        };
      })
    );
  };

  const addJobTitle = (stepId: string) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== stepId) return s;
        return {
          ...s,
          contactSearchConfig: {
            jobTitles: [...(s.contactSearchConfig?.jobTitles || []), ""],
          },
        };
      })
    );
  };

  const updateJobTitle = (
    stepId: string,
    titleIndex: number,
    value: string
  ) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== stepId) return s;
        const titles = [...(s.contactSearchConfig?.jobTitles || [])];
        titles[titleIndex] = value;
        return {
          ...s,
          contactSearchConfig: { jobTitles: titles },
        };
      })
    );
  };

  const removeJobTitle = (stepId: string, titleIndex: number) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== stepId) return s;
        return {
          ...s,
          contactSearchConfig: {
            jobTitles: (s.contactSearchConfig?.jobTitles || []).filter(
              (_, i) => i !== titleIndex
            ),
          },
        };
      })
    );
  };

  const isValid = () => {
    if (!identifierColumn) return false;
    return steps.every(
      (s) =>
        s.name.trim() &&
        (s.type === "contact_search" ||
          (s.prompt.trim() &&
            s.outputFields.some((f) => f.displayName.trim())))
    );
  };

  const handleStart = () => {
    if (!isValid()) return;

    // For contact_search steps, ensure contactSearchConfig has at least one title
    const cleanedSteps = steps.map((s) => {
      if (s.type === "contact_search") {
        const titles = (s.contactSearchConfig?.jobTitles || []).filter(
          (t) => t.trim()
        );
        return {
          ...s,
          inputColumns: s.inputColumns.length ? s.inputColumns : [identifierColumn],
          contactSearchConfig: {
            jobTitles: titles.length > 0 ? titles : ["CEO"],
          },
        };
      }
      return {
        ...s,
        inputColumns: s.inputColumns.length ? s.inputColumns : [identifierColumn],
        outputFields: s.outputFields.filter((f) => f.displayName.trim()),
      };
    });

    onStartPipeline({
      identifierColumn,
      steps: cleanedSteps,
    });
  };

  return (
    <div className="space-y-6">
      {/* Identifier Column */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Identifier Column
        </label>
        <p className="text-xs text-gray-500 mb-2">
          The main column to identify each row (e.g. Company Name)
        </p>
        <select
          value={identifierColumn}
          onChange={(e) => setIdentifierColumn(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
        >
          {columns.map((col) => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
        </select>
      </div>

      {/* Steps */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Pipeline Steps
        </label>
        <div className="space-y-3">
          {steps.map((step, stepIndex) => {
            const typeInfo = STEP_TYPE_INFO[step.type];
            const Icon = typeInfo.icon;
            const isExpanded = expandedSteps.has(step.id);

            return (
              <div
                key={step.id}
                className="border border-gray-200 rounded-xl overflow-hidden"
              >
                {/* Step Header */}
                <div
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                    isExpanded ? "border-b border-gray-100" : ""
                  }`}
                  onClick={() => toggleStep(step.id)}
                >
                  <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border ${typeInfo.color}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900">
                      {step.name || `Step ${stepIndex + 1}`}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">
                      {typeInfo.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveStep(step.id, "up");
                      }}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30"
                      disabled={stepIndex === 0}
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveStep(step.id, "down");
                      }}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30"
                      disabled={stepIndex === steps.length - 1}
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {steps.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeStep(step.id);
                        }}
                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Step Body */}
                {isExpanded && (
                  <div className="px-4 py-4 space-y-4 bg-gray-50/50">
                    {/* Step Name */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Step Name
                      </label>
                      <input
                        type="text"
                        value={step.name}
                        onChange={(e) =>
                          updateStep(step.id, { name: e.target.value })
                        }
                        placeholder="e.g. Business Model Research"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                      />
                    </div>

                    {/* Step Type */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Type
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          Object.entries(STEP_TYPE_INFO) as [
                            PipelineStepType,
                            (typeof STEP_TYPE_INFO)[PipelineStepType]
                          ][]
                        ).map(([type, info]) => {
                          const TypeIcon = info.icon;
                          return (
                            <button
                              key={type}
                              onClick={() => updateStep(step.id, { type })}
                              className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-xs transition-all ${
                                step.type === type
                                  ? `${info.color} border-current`
                                  : "border-gray-200 text-gray-500 hover:border-gray-300"
                              }`}
                            >
                              <TypeIcon className="w-4 h-4" />
                              <span className="font-medium">{info.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Input Columns */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Input Columns
                      </label>
                      <p className="text-xs text-gray-400 mb-1">
                        CSV columns to use (leave empty to use identifier only)
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {columns.map((col) => (
                          <button
                            key={col}
                            onClick={() => {
                              const current = step.inputColumns;
                              const updated = current.includes(col)
                                ? current.filter((c) => c !== col)
                                : [...current, col];
                              updateStep(step.id, {
                                inputColumns: updated,
                              });
                            }}
                            className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                              step.inputColumns.includes(col)
                                ? "bg-orange-50 border-orange-300 text-orange-700"
                                : "border-gray-200 text-gray-500 hover:border-gray-300"
                            }`}
                          >
                            {col}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Use Previous Steps */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`prev-${step.id}`}
                        checked={step.usePreviousSteps}
                        onChange={(e) =>
                          updateStep(step.id, {
                            usePreviousSteps: e.target.checked,
                          })
                        }
                        className="rounded border-gray-300"
                      />
                      <label
                        htmlFor={`prev-${step.id}`}
                        className="text-xs text-gray-600"
                      >
                        Include outputs from previous steps as context
                      </label>
                    </div>

                    {/* Prompt (not for contact_search) */}
                    {step.type !== "contact_search" && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Prompt
                        </label>
                        <textarea
                          value={step.prompt}
                          onChange={(e) =>
                            updateStep(step.id, { prompt: e.target.value })
                          }
                          placeholder={
                            step.type === "web_research"
                              ? "e.g. Research the company's business model, key products/services, and market positioning"
                              : "e.g. Based on the data collected, analyze the biodiversity risks and provide recommendations"
                          }
                          rows={3}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 resize-none"
                        />
                      </div>
                    )}

                    {/* Output Fields (not for contact_search) */}
                    {step.type !== "contact_search" && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-2">
                          Output Fields
                        </label>
                        <div className="space-y-2">
                          {step.outputFields.map((field, fieldIndex) => (
                            <div
                              key={fieldIndex}
                              className="flex items-start gap-2"
                            >
                              <div className="flex-1 grid grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  value={field.displayName}
                                  onChange={(e) =>
                                    updateOutputField(
                                      step.id,
                                      fieldIndex,
                                      { displayName: e.target.value }
                                    )
                                  }
                                  placeholder="Field name"
                                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                                />
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={field.description}
                                    onChange={(e) =>
                                      updateOutputField(
                                        step.id,
                                        fieldIndex,
                                        { description: e.target.value }
                                      )
                                    }
                                    placeholder="Description"
                                    className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                                  />
                                  <select
                                    value={field.type}
                                    onChange={(e) =>
                                      updateOutputField(
                                        step.id,
                                        fieldIndex,
                                        {
                                          type: e.target.value as EnrichmentField["type"],
                                        }
                                      )
                                    }
                                    className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none"
                                  >
                                    <option value="string">Text</option>
                                    <option value="number">Number</option>
                                    <option value="boolean">Bool</option>
                                    <option value="array">List</option>
                                  </select>
                                </div>
                              </div>
                              {step.outputFields.length > 1 && (
                                <button
                                  onClick={() =>
                                    removeOutputField(step.id, fieldIndex)
                                  }
                                  className="p-1 mt-0.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            onClick={() => addOutputField(step.id)}
                            className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            Add field
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Job Titles (for contact_search) */}
                    {step.type === "contact_search" && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-2">
                          Job Titles to Search
                        </label>
                        <div className="space-y-2">
                          {(step.contactSearchConfig?.jobTitles || [""]).map(
                            (title, titleIndex) => (
                              <div
                                key={titleIndex}
                                className="flex items-center gap-2"
                              >
                                <input
                                  type="text"
                                  value={title}
                                  onChange={(e) =>
                                    updateJobTitle(
                                      step.id,
                                      titleIndex,
                                      e.target.value
                                    )
                                  }
                                  placeholder="e.g. CEO, Head of Sustainability"
                                  className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                                />
                                {(step.contactSearchConfig?.jobTitles || [])
                                  .length > 1 && (
                                  <button
                                    onClick={() =>
                                      removeJobTitle(step.id, titleIndex)
                                    }
                                    className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )
                          )}
                          <button
                            onClick={() => addJobTitle(step.id)}
                            className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            Add job title
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Step Button */}
        <button
          onClick={addStep}
          className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-orange-300 hover:text-orange-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Step
        </button>
      </div>

      {/* Start Button */}
      <button
        onClick={handleStart}
        disabled={!isValid()}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
      >
        Start Pipeline ({steps.length} step{steps.length > 1 ? "s" : ""})
      </button>
    </div>
  );
}
