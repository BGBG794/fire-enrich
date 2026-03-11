"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import Input from "@/components/ui/input";
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
import { Globe, Loader2 } from "lucide-react";
import type { CSVRow } from "@/lib/types";

interface UrlScraperProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: CSVRow[], columns: string[]) => void;
}

export function UrlScraper({ open, onClose, onImport }: UrlScraperProps) {
  const [url, setUrl] = useState("");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    rows: CSVRow[];
    columns: string[];
  } | null>(null);

  const handleScrape = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const res = await fetch("/api/scrape-to-rows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), instructions: instructions.trim() || undefined }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Scrape failed (${res.status})`);
      }

      const data = await res.json();
      const rows: CSVRow[] = data.rows || [];
      const columns: string[] = data.columns || (rows.length > 0 ? Object.keys(rows[0]) : []);

      if (rows.length === 0) {
        setError("No data could be extracted from this URL.");
        return;
      }

      setPreview({ rows, columns });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to scrape URL");
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
    setUrl("");
    setInstructions("");
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
            <Globe size={18} />
            Scrape URL
          </DialogTitle>
          <DialogDescription>
            Extract structured data from a web page.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="flex flex-col" style={{ gap: 16, padding: "8px 0" }}>
            <div className="flex flex-col" style={{ gap: 6 }}>
              <label className="text-sm font-medium">URL</label>
              <Input
                type="url"
                placeholder="https://example.com/page-with-data"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="flex flex-col" style={{ gap: 6 }}>
              <label className="text-sm font-medium">
                Instructions <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Textarea
                placeholder='e.g. "Extract only the real estate agencies with their name, address, and phone number"'
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                disabled={loading}
                rows={3}
                style={{ minHeight: 72 }}
              />
            </div>

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
              Found {preview.rows.length} rows with {preview.columns.length} columns. Showing first {previewRows.length}:
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
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={handleReset} disabled={loading}>
            Cancel
          </Button>
          {!preview ? (
            <Button
              variant="primary"
              onClick={handleScrape}
              disabled={loading || !url.trim()}
            >
              {loading ? (
                <span className="flex items-center" style={{ gap: 8 }}>
                  <Loader2 size={14} className="animate-spin" />
                  Scraping...
                </span>
              ) : (
                "Scrape"
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
