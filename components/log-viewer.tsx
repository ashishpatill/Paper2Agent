"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LogViewer({
  jobId,
  initialLogPath
}: {
  jobId: string;
  initialLogPath?: string;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchLogs() {
      const res = await fetch(`/api/jobs/${jobId}/logs?tail=200`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setLines(data.lines ?? []);
      }
    }

    void fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [jobId]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const filteredLines = search
    ? lines.filter((l) => l.toLowerCase().includes(search.toLowerCase()))
    : lines;

  function handleDownload() {
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job-${jobId}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Live Logs</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">
              {filteredLines.length} lines
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setAutoScroll(!autoScroll)}
              title={autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}
            >
              {autoScroll ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleDownload}
              title="Download log"
            >
              <Download className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search logs..."
          className="mt-2 w-full rounded-md border border-border/50 bg-input px-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="h-[500px] overflow-auto rounded-lg bg-[oklch(0.10_0.01_260)] p-4 font-mono text-xs leading-relaxed text-[oklch(0.80_0.01_140)]"
        >
          {filteredLines.length === 0 ? (
            <p className="text-muted-foreground">
              Waiting for log output...
            </p>
          ) : (
            filteredLines.map((line, i) => (
              <div key={i} className="flex gap-3 hover:bg-white/5">
                <span className="w-8 shrink-0 select-none text-right tabular-nums text-[oklch(0.50_0.01_260)]">
                  {i + 1}
                </span>
                <span className="break-all whitespace-pre-wrap">{line}</span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
