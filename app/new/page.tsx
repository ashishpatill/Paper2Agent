"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bot, FileUp, Link2, LoaderCircle } from "lucide-react";

import type { JobRecord } from "@/lib/server/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export default function NewJobPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"url" | "pdf">("url");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setFormError(null);
    if (activeTab === "pdf" && !selectedFile) {
      setFormError("Choose a PDF file before creating the job.");
      return;
    }

    if (selectedFile) {
      formData.set("paperPdf", selectedFile);
    }

    const response = await fetch("/api/jobs", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const message = await response.text();
      setFormError(message);
      return;
    }

    const job = (await response.json()) as JobRecord;
    router.push(`/jobs/${job.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
          New Job
        </h1>
        <p className="text-sm text-muted-foreground">
          Submit a paper URL or upload a PDF. The pipeline will analyze the paper, find or clone the
          repository, and implement the paper&apos;s findings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Paper Source</CardTitle>
          <CardDescription>Choose how to provide the paper.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-6"
            action={(formData) =>
              startSubmitting(() => {
                void handleSubmit(formData);
              })
            }
          >
            <input type="hidden" name="sourceType" value={activeTab} />
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as "url" | "pdf")}
            >
              <TabsList>
                <TabsTrigger value="url">
                  <Link2 className="mr-2 h-4 w-4" />
                  Paper URL
                </TabsTrigger>
                <TabsTrigger value="pdf">
                  <FileUp className="mr-2 h-4 w-4" />
                  PDF Upload
                </TabsTrigger>
              </TabsList>
              <TabsContent value="url" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="paperUrl">Paper URL</Label>
                  <Input
                    id="paperUrl"
                    name="paperUrl"
                    placeholder="https://arxiv.org/abs/..."
                    required={activeTab === "url"}
                  />
                </div>
              </TabsContent>
              <TabsContent value="pdf" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="paperPdf">Paper PDF</Label>
                  <Input
                    id="paperPdf"
                    name="paperPdf"
                    type="file"
                    accept="application/pdf"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                    required={activeTab === "pdf"}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="projectName">Project name</Label>
                <Input
                  id="projectName"
                  name="projectName"
                  placeholder="alphagenome-agent"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="repositoryUrl">Repository URL (optional)</Label>
                <Input
                  id="repositoryUrl"
                  name="repositoryUrl"
                  placeholder="https://github.com/org/repo"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes for the intake agent</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Optional guidance, e.g. preferred tutorials or benchmark extraction."
                rows={3}
              />
            </div>

            <Button disabled={isSubmitting} type="submit" size="lg" className="w-full">
              {isSubmitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
              Create Job
            </Button>
            {formError && (
              <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {formError}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
