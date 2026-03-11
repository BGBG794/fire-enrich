"use client";

import { useState, useEffect, useCallback } from "react";
import { nanoid } from "nanoid";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Button from "@/components/shared/button/button";
import { CSVUploader } from "../csv-uploader";
import { UrlScraper } from "./url-scraper";
import { PasteInput } from "./paste-input";
import type { View } from "../app-sidebar";
import type { CSVRow, ProjectSource } from "@/lib/types";
import {
  FileSpreadsheet,
  Globe,
  ClipboardPaste,
  Plus,
  X,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface DataTabProps {
  projectId: string;
  columns: string[];
  rows: Array<{ id: string; rowIndex: number; data: CSVRow }>;
  onRefresh: () => void;
  onNavigate: (view: View) => void;
}

const PAGE_SIZE = 50;

export function DataTab({ projectId, columns, rows, onRefresh, onNavigate }: DataTabProps) {
  const [sources, setSources] = useState<ProjectSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [deletingSource, setDeletingSource] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Dialog states
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);

  const loadSources = useCallback(async () => {
    setLoadingSources(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/rows`);
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
      }
    } catch (e) {
      console.error("Failed to load sources:", e);
    } finally {
      setLoadingSources(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const handleDeleteSource = async (sourceId: string) => {
    setDeletingSource(sourceId);
    try {
      const res = await fetch(`/api/projects/${projectId}/rows`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId }),
      });
      if (res.ok) {
        toast.success("Source deleted");
        onRefresh();
        loadSources();
      } else {
        toast.error("Failed to delete source");
      }
    } catch (e) {
      toast.error("Failed to delete source");
    } finally {
      setDeletingSource(null);
    }
  };

  const importRows = async (
    newRows: CSVRow[],
    newColumns: string[],
    sourceType: "csv" | "url" | "paste",
    sourceName: string
  ) => {
    const sourceId = nanoid(10);
    const taggedRows = newRows.map((row) => ({
      ...row,
      _source_type: sourceType,
      _source_name: sourceName,
      _source_id: sourceId,
    }));

    try {
      const res = await fetch(`/api/projects/${projectId}/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: taggedRows, columns: newColumns }),
      });
      if (res.ok) {
        toast.success(`Imported ${taggedRows.length} rows from ${sourceName}`);
        onRefresh();
        loadSources();
      } else {
        toast.error("Failed to import rows");
      }
    } catch (e) {
      toast.error("Failed to import rows");
    }
  };

  const handleCSVUpload = (csvRows: CSVRow[], csvColumns: string[]) => {
    setCsvDialogOpen(false);
    importRows(csvRows, csvColumns, "csv", `CSV Import`);
  };

  const handleUrlImport = (urlRows: CSVRow[], urlColumns: string[]) => {
    setUrlDialogOpen(false);
    importRows(urlRows, urlColumns, "url", `URL Scrape`);
  };

  const handlePasteImport = (pasteRows: CSVRow[], pasteColumns: string[]) => {
    setPasteDialogOpen(false);
    importRows(pasteRows, pasteColumns, "paste", `Pasted Data`);
  };

  // Pagination
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paginatedRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Visible columns: filter out internal _source fields for display, but keep _source_name
  const displayColumns = columns.filter(
    (c) => c !== "_source_type" && c !== "_source_id"
  );
  // Ensure _source_name is visible as "Source"
  const hasSourceColumn = columns.includes("_source_name");

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: source pills + add source */}
      <div
        className="flex items-center flex-wrap border-b border-border bg-card"
        style={{ padding: "12px 16px", gap: 8 }}
      >
        {loadingSources ? (
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        ) : (
          sources.map((src) => (
            <div
              key={src.sourceId}
              className="flex items-center bg-muted rounded-md text-sm"
              style={{ padding: "4px 10px", gap: 6 }}
            >
              {src.sourceType === "csv" && <FileSpreadsheet size={13} className="text-muted-foreground" />}
              {src.sourceType === "url" && <Globe size={13} className="text-muted-foreground" />}
              {src.sourceType === "paste" && <ClipboardPaste size={13} className="text-muted-foreground" />}
              <span className="text-foreground" style={{ fontSize: 13 }}>
                {src.sourceName}
              </span>
              <span className="text-muted-foreground" style={{ fontSize: 11 }}>
                ({src.rowCount})
              </span>
              <button
                onClick={() => handleDeleteSource(src.sourceId)}
                disabled={deletingSource === src.sourceId}
                className="text-muted-foreground hover:text-red-500 transition-colors"
                style={{ marginLeft: 2 }}
              >
                {deletingSource === src.sourceId ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <X size={12} />
                )}
              </button>
            </div>
          ))
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="default" style={{ fontSize: 13 }}>
              <Plus size={14} />
              Add Source
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setCsvDialogOpen(true)}>
              <FileSpreadsheet size={14} />
              Import CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setUrlDialogOpen(true)}>
              <Globe size={14} />
              Scrape URL
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPasteDialogOpen(true)}>
              <ClipboardPaste size={14} />
              Paste Data
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />
        <span className="text-sm text-muted-foreground">
          {rows.length} total rows
        </span>
      </div>

      {/* Data table */}
      {rows.length === 0 ? (
        <div
          className="flex-1 flex flex-col items-center justify-center text-muted-foreground"
          style={{ padding: 48 }}
        >
          <FileSpreadsheet size={40} className="text-muted-foreground" style={{ marginBottom: 16, opacity: 0.4 }} />
          <p className="text-sm" style={{ marginBottom: 4 }}>No data yet</p>
          <p className="text-xs text-muted-foreground">
            Add a source using the button above to get started.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ fontSize: 12, width: 50, whiteSpace: "nowrap" }}>#</TableHead>
                {hasSourceColumn && (
                  <TableHead style={{ fontSize: 12, whiteSpace: "nowrap" }}>Source</TableHead>
                )}
                {displayColumns
                  .filter((c) => c !== "_source_name")
                  .map((col) => (
                    <TableHead key={col} style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      {col}
                    </TableHead>
                  ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                    {row.rowIndex + 1}
                  </TableCell>
                  {hasSourceColumn && (
                    <TableCell style={{ fontSize: 12 }}>
                      <span
                        className="bg-muted rounded text-muted-foreground"
                        style={{ padding: "2px 6px", fontSize: 11 }}
                      >
                        {row.data._source_name || ""}
                      </span>
                    </TableCell>
                  )}
                  {displayColumns
                    .filter((c) => c !== "_source_name")
                    .map((col) => (
                      <TableCell
                        key={col}
                        style={{
                          fontSize: 12,
                          maxWidth: 200,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.data[col] || ""}
                      </TableCell>
                    ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          className="flex items-center justify-between border-t border-border bg-card"
          style={{ padding: "8px 16px" }}
        >
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center" style={{ gap: 4 }}>
            <Button
              variant="secondary"
              size="default"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ padding: "4px 8px" }}
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              variant="secondary"
              size="default"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ padding: "4px 8px" }}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* CSV Import Dialog */}
      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent className="sm:max-w-lg" style={{ padding: 24 }}>
          <DialogHeader>
            <DialogTitle className="flex items-center" style={{ gap: 8 }}>
              <FileSpreadsheet size={18} />
              Import CSV
            </DialogTitle>
          </DialogHeader>
          <CSVUploader onUpload={handleCSVUpload} />
        </DialogContent>
      </Dialog>

      {/* URL Scraper Dialog */}
      <UrlScraper
        open={urlDialogOpen}
        onClose={() => setUrlDialogOpen(false)}
        onImport={handleUrlImport}
      />

      {/* Paste Input Dialog */}
      <PasteInput
        open={pasteDialogOpen}
        onClose={() => setPasteDialogOpen(false)}
        onImport={handlePasteImport}
      />
    </div>
  );
}
