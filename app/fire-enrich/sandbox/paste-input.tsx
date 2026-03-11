"use client";

import { useState } from "react";
import Papa from "papaparse";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import Button from "@/components/shared/button/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClipboardPaste, Loader2 } from "lucide-react";
import type { CSVRow } from "@/lib/types";

interface PasteInputProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: CSVRow[], columns: string[]) => void;
}

function tryParseJSON(text: string): { rows: CSVRow[]; columns: string[] } | null {
  try {
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    if (arr.length === 0 || typeof arr[0] !== "object") return null;
    const columns = Object.keys(arr[0]);
    const rows: CSVRow[] = arr.map((item) => {
      const row: CSVRow = {};
      for (const key of columns) {
        row[key] = item[key] != null ? String(item[key]) : "";
      }
      return row;
    });
    return { rows, columns };
  } catch {
    return null;
  }
}

function tryParseCSVOrTSV(text: string): { rows: CSVRow[]; columns: string[] } | null {
  const result = Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
    transform: (v: string) => v.trim(),
  });

  if (result.errors.length > 0 && result.data.length === 0) return null;

  const rows = result.data as CSVRow[];
  const validRows = rows.filter((row) =>
    Object.values(row).some((value) => value && String(value).trim() !== "")
  );

  if (validRows.length === 0) return null;

  const columns = Object.keys(validRows[0]);
  // Heuristic: if there's only one column and many rows, it might be unstructured text
  if (columns.length === 1 && validRows.length > 1) return null;

  return { rows: validRows, columns };
}

export function PasteInput({ open, onClose, onImport }: PasteInputProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    rows: CSVRow[];
    columns: string[];
  } | null>(null);

  const handleParse = async () => {
    if (!text.trim()) return;
    setError(null);
    setPreview(null);

    // Try JSON first
    const jsonResult = tryParseJSON(text);
    if (jsonResult && jsonResult.rows.length > 0) {
      setPreview(jsonResult);
      return;
    }

    // Try CSV/TSV
    const csvResult = tryParseCSVOrTSV(text);
    if (csvResult && csvResult.rows.length > 0) {
      setPreview(csvResult);
      return;
    }

    // Fall back to API for unstructured text
    setLoading(true);
    try {
      const res = await fetch("/api/parse-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Parse failed (${res.status})`);
      }

      const data = await res.json();
      const rows: CSVRow[] = data.rows || [];
      const columns: string[] = data.columns || (rows.length > 0 ? Object.keys(rows[0]) : []);

      if (rows.length === 0) {
        setError("Could not extract structured data from the pasted text.");
        return;
      }

      setPreview({ rows, columns });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse text");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (!preview) return;
    onImport(preview.rows, preview.columns);
    handleReset();
  };

  const handleReset = () => {
    setText("");
    setLoading(false);
    setError(null);
    setPreview(null);
    onClose();
  };

  const previewRows = preview ? preview.rows.slice(0, 5) : [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); }}>
      <DialogContent className="sm:max-w-2xl" style={{ padding: 24 }}>
        <DialogHeader>
          <DialogTitle className="flex items-center" style={{ gap: 8 }}>
            <ClipboardPaste size={18} />
            Paste Data
          </DialogTitle>
          <DialogDescription>
            Paste CSV, TSV, JSON, or any text with structured data.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="flex flex-col" style={{ gap: 16, padding: "8px 0" }}>
            <Textarea
              placeholder="Paste CSV, TSV, JSON, or any text..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={loading}
              rows={10}
              style={{ minHeight: 200, fontFamily: "monospace", fontSize: 13 }}
            />

            {error && (
              <div
                className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md"
                style={{ padding: "8px 12px" }}
              >
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: 12, padding: "8px 0" }}>
            <p className="text-sm text-muted-foreground">
              Parsed {preview.rows.length} rows with {preview.columns.length} columns. Showing first {previewRows.length}:
            </p>
            <div className="border rounded-md overflow-auto" style={{ maxHeight: 280 }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    {preview.columns.map((col) => (
                      <TableHead key={col} style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, i) => (
                    <TableRow key={i}>
                      {preview.columns.map((col) => (
                        <TableCell
                          key={col}
                          style={{ fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {row[col] || ""}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button
              variant="secondary"
              onClick={() => setPreview(null)}
              className="w-fit"
              style={{ fontSize: 12 }}
            >
              Back to editor
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={handleReset} disabled={loading}>
            Cancel
          </Button>
          {!preview ? (
            <Button
              variant="primary"
              onClick={handleParse}
              disabled={loading || !text.trim()}
            >
              {loading ? (
                <span className="flex items-center" style={{ gap: 8 }}>
                  <Loader2 size={14} className="animate-spin" />
                  Parsing...
                </span>
              ) : (
                "Parse"
              )}
            </Button>
          ) : (
            <Button variant="primary" onClick={handleImport}>
              Import {preview.rows.length} rows
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
