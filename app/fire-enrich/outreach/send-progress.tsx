"use client";

import { useState, useEffect, useRef } from "react";
import { X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SendProgressProps {
  campaignId: string;
  onComplete: () => void;
  onClose: () => void;
}

interface LogEntry {
  message: string;
  type: "info" | "success" | "warning" | "error";
  timestamp: number;
}

export function SendProgress({
  campaignId,
  onComplete,
  onClose,
}: SendProgressProps) {
  const [status, setStatus] = useState<"connecting" | "sending" | "complete" | "error">("connecting");
  const [totalRecipients, setTotalRecipients] = useState(0);
  const [sent, setSent] = useState(0);
  const [failed, setFailed] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eventSource = new EventSource(
      `/api/outreach/campaigns/${campaignId}/launch`,
    );

    // We can't use EventSource for POST, so use fetch instead
    const controller = new AbortController();

    fetch(`/api/outreach/campaigns/${campaignId}/launch`, {
      method: "POST",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case "started":
                setStatus("sending");
                setTotalRecipients(data.totalRecipients);
                addLog(`Starting campaign: ${data.totalRecipients} recipients`, "info");
                break;
              case "progress":
                addLog(data.message, data.messageType);
                if (data.messageType === "success") setSent((s) => s + 1);
                if (data.messageType === "error") setFailed((f) => f + 1);
                break;
              case "complete":
                setStatus("complete");
                setSent(data.sent);
                setFailed(data.failed);
                addLog(
                  `Complete: ${data.sent} sent, ${data.failed} failed`,
                  "success",
                );
                onComplete();
                break;
              case "error":
                setStatus("error");
                addLog(`Error: ${data.error}`, "error");
                break;
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    }).catch((error) => {
      if (error.name !== "AbortError") {
        setStatus("error");
        addLog(`Connection error: ${error.message}`, "error");
      }
    });

    // Cleanup: close EventSource if it was opened, abort fetch
    return () => {
      eventSource.close();
      controller.abort();
    };
  }, [campaignId]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (message: string, type: LogEntry["type"]) => {
    setLogs((prev) => [...prev, { message, type, timestamp: Date.now() }]);
  };

  const progress =
    totalRecipients > 0
      ? Math.round(((sent + failed) / totalRecipients) * 100)
      : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            {status === "sending" && (
              <Loader2 size={16} className="animate-spin text-orange-500" />
            )}
            {status === "complete" && (
              <CheckCircle size={16} className="text-green-500" />
            )}
            {status === "error" && (
              <AlertCircle size={16} className="text-red-500" />
            )}
            <span className="text-sm font-semibold text-foreground">
              {status === "connecting" && "Connecting..."}
              {status === "sending" && `Sending emails... ${progress}%`}
              {status === "complete" && "Campaign launched"}
              {status === "error" && "Launch failed"}
            </span>
          </div>
          {(status === "complete" || status === "error") && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X size={14} />
            </Button>
          )}
        </div>

        {/* Progress bar */}
        {totalRecipients > 0 && (
          <div className="px-4 pt-3">
            <div className="h-2 rounded-full bg-accent/50 overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>
                {sent} sent, {failed} failed
              </span>
              <span>{totalRecipients} total</span>
            </div>
          </div>
        )}

        {/* Logs */}
        <div className="p-4 max-h-64 overflow-y-auto">
          <div className="space-y-1">
            {logs.map((log, i) => (
              <div
                key={i}
                className={`text-xs font-mono ${
                  log.type === "success"
                    ? "text-green-500"
                    : log.type === "error"
                      ? "text-red-500"
                      : log.type === "warning"
                        ? "text-yellow-500"
                        : "text-muted-foreground"
                }`}
              >
                {log.message}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
