"use client";

import { useState } from "react";
import type { TemplateVariable } from "@/lib/types";

interface VariablePickerProps {
  variables: TemplateVariable[];
  onInsert: (variable: string) => void;
}

export function VariablePicker({ variables, onInsert }: VariablePickerProps) {
  const [search, setSearch] = useState("");

  // Group by source
  const grouped = variables.reduce<Record<string, TemplateVariable[]>>(
    (acc, v) => {
      const source = v.source || "Other";
      if (!acc[source]) acc[source] = [];
      acc[source].push(v);
      return acc;
    },
    {},
  );

  const filtered = search
    ? Object.fromEntries(
        Object.entries(grouped)
          .map(([source, vars]) => [
            source,
            vars.filter(
              (v) =>
                v.key.toLowerCase().includes(search.toLowerCase()) ||
                v.displayName.toLowerCase().includes(search.toLowerCase()),
            ),
          ])
          .filter(([, vars]) => (vars as TemplateVariable[]).length > 0),
      )
    : grouped;

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="p-2 border-b border-border">
        <input
          type="text"
          placeholder="Search variables..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-xs px-2 py-1.5 rounded bg-accent/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>
      <div className="max-h-60 overflow-y-auto p-1">
        {Object.entries(filtered).map(([source, vars]) => (
          <div key={source} className="mb-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
              {source}
            </div>
            {(vars as TemplateVariable[]).map((v) => (
              <button
                key={v.key}
                onClick={() => onInsert(`{{${v.key}}}`)}
                className="w-full text-left px-2 py-1 text-xs rounded hover:bg-accent/80 text-foreground flex items-center justify-between group"
              >
                <span className="font-mono text-orange-500 dark:text-orange-400">
                  {`{{${v.key}}}`}
                </span>
                <span className="text-muted-foreground text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">
                  Click to insert
                </span>
              </button>
            ))}
          </div>
        ))}
        {Object.keys(filtered).length === 0 && (
          <p className="text-xs text-muted-foreground p-2">No variables found</p>
        )}
      </div>
    </div>
  );
}
