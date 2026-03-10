"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { VariablePicker } from "./variable-picker";
import type { TemplateVariable, EmailTemplate } from "@/lib/types";
import { Save, Eye, EyeOff, Plus } from "lucide-react";
import { toast } from "sonner";

interface TemplateEditorProps {
  projectId: string;
  templates: EmailTemplate[];
  variables: TemplateVariable[];
  onSave: () => void;
}

export function TemplateEditor({
  projectId,
  templates,
  variables,
  onSave,
}: TemplateEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    templates[0]?.id ?? null,
  );
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (selectedId) {
      const tmpl = templates.find((t) => t.id === selectedId);
      if (tmpl) {
        setName(tmpl.name);
        setSubject(tmpl.subject);
        setBody(tmpl.body);
      }
    }
  }, [selectedId, templates]);

  const handleNew = () => {
    setSelectedId(null);
    setName("");
    setSubject("Hello {{ContactSearch__CEO_name}}");
    setBody(
      `<p>Hi {{ContactSearch__CEO_name}},</p>\n\n<p>I noticed that {{Entreprise}} is doing great work in your industry.</p>\n\n<p>I'd love to connect and share some insights.</p>\n\n<p>Best,<br/>Your name</p>`,
    );
  };

  const handleSave = async () => {
    if (!name.trim() || !subject.trim() || !body.trim()) {
      toast.error("Name, subject, and body are required");
      return;
    }

    setSaving(true);
    try {
      if (selectedId) {
        await fetch(`/api/outreach/templates/${selectedId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, subject, body }),
        });
        toast.success("Template updated");
      } else {
        const res = await fetch("/api/outreach/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, name, subject, body }),
        });
        const data = await res.json();
        setSelectedId(data.id);
        toast.success("Template created");
      }
      onSave();
    } catch {
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!selectedId && !body) return;
    try {
      const res = await fetch("/api/outreach/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          templateId: selectedId,
          rowIndex: 0,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewSubject(data.subject);
        setPreviewHtml(data.body);
        setShowPreview(true);
      }
    } catch {
      toast.error("Preview failed");
    }
  };

  const insertVariable = (variable: string) => {
    if (bodyRef.current) {
      const start = bodyRef.current.selectionStart;
      const end = bodyRef.current.selectionEnd;
      const newBody = body.slice(0, start) + variable + body.slice(end);
      setBody(newBody);
      setTimeout(() => {
        bodyRef.current?.setSelectionRange(
          start + variable.length,
          start + variable.length,
        );
        bodyRef.current?.focus();
      }, 0);
    } else {
      setBody(body + variable);
    }
  };

  return (
    <div className="space-y-4">
      {/* Template list + New button */}
      <div className="flex items-center gap-2 flex-wrap">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedId(t.id)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
              selectedId === t.id
                ? "bg-orange-500 text-white border-orange-500"
                : "bg-card text-foreground border-border hover:border-orange-300"
            }`}
          >
            {t.name}
          </button>
        ))}
        <button
          onClick={handleNew}
          className="px-3 py-1.5 text-xs rounded-full border border-dashed border-border text-muted-foreground hover:border-orange-300 hover:text-foreground flex items-center gap-1"
        >
          <Plus size={12} /> New
        </button>
      </div>

      {/* Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <input
            type="text"
            placeholder="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <input
            type="text"
            placeholder="Subject line — use {{variable}} for personalization"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <textarea
            ref={bodyRef}
            placeholder="Email body (HTML) — use {{variable}} for personalization"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-orange-500 resize-y"
          />
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              variant="orange"
              className="flex items-center gap-1.5"
            >
              <Save size={14} />
              {saving ? "Saving..." : "Save Template"}
            </Button>
            {selectedId && (
              <Button
                onClick={handlePreview}
                size="sm"
                variant="outline"
                className="flex items-center gap-1.5"
              >
                {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                Preview
              </Button>
            )}
          </div>

          {/* Preview panel */}
          {showPreview && (
            <div className="border border-border rounded-lg p-4 bg-accent/30">
              <div className="text-xs text-muted-foreground mb-1">
                Preview (Row 1):
              </div>
              <div className="text-sm font-medium text-foreground mb-2">
                Subject: {previewSubject}
              </div>
              <div
                className="text-sm text-foreground prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          )}
        </div>

        {/* Variable picker sidebar */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">
            Insert Variable
          </div>
          <VariablePicker variables={variables} onInsert={insertVariable} />
        </div>
      </div>
    </div>
  );
}
