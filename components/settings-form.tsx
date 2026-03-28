"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, Sparkles, Terminal } from "lucide-react";

import type { SecretsSummary } from "@/lib/server/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

export function SettingsForm({ initialSettings }: { initialSettings: SecretsSummary }) {
  const [settings, setSettings] = useState(initialSettings);
  const [isSaving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(formData: FormData) {
    setError(null);
    setSaved(false);

    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        geminiApiKey: formData.get("geminiApiKey"),
        openrouterApiKey: formData.get("openrouterApiKey"),
        geminiModel: formData.get("geminiModel"),
        openrouterModel: formData.get("openrouterModel"),
        preferredProvider: formData.get("preferredProvider")
      })
    });

    if (!response.ok) {
      setError(await response.text());
      return;
    }

    const next = (await response.json()) as SecretsSummary;
    setSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-6">
      {/* CLI Integrations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="h-4 w-4" />
            CLI Integrations
          </CardTitle>
          <CardDescription>
            The pipeline uses Claude Code CLI by default. These are detected automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CliRow
            name="Claude Code"
            command="claude"
            description="Uses your Claude subscription. No API key needed."
          />
          <CliRow
            name="Codex"
            command="codex"
            description="Uses your OpenAI Codex subscription."
          />
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Provider Keys</CardTitle>
          <CardDescription>
            Keys are stored server-side in a gitignored file and never sent back to the client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-5"
            action={(formData) =>
              startSaving(() => {
                void handleSave(formData);
              })
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="geminiApiKey">Gemini API Key</Label>
                <Input
                  id="geminiApiKey"
                  name="geminiApiKey"
                  type="password"
                  placeholder={settings.hasGeminiKey ? "Saved locally" : "AIza..."}
                />
                {settings.hasGeminiKey && (
                  <p className="flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 className="h-3 w-3" /> Configured
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="openrouterApiKey">OpenRouter API Key</Label>
                <Input
                  id="openrouterApiKey"
                  name="openrouterApiKey"
                  type="password"
                  placeholder={settings.hasOpenRouterKey ? "Saved locally" : "sk-or-v1-..."}
                />
                {settings.hasOpenRouterKey && (
                  <p className="flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 className="h-3 w-3" /> Configured
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="geminiModel">Gemini Model</Label>
                <Input
                  id="geminiModel"
                  name="geminiModel"
                  defaultValue={settings.geminiModel}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="openrouterModel">OpenRouter Model</Label>
                <Input
                  id="openrouterModel"
                  name="openrouterModel"
                  defaultValue={settings.openrouterModel}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Preferred Provider</Label>
              <Select defaultValue={settings.preferredProvider} name="preferredProvider">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button disabled={isSaving} type="submit" className="w-full">
              {isSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {saved ? "Saved" : "Save Settings"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Readiness */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Runtime Readiness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ReadinessRow
            label="Gemini"
            ok={settings.hasGeminiKey}
            detail={settings.hasGeminiKey ? settings.geminiModel : "Not configured"}
          />
          <ReadinessRow
            label="OpenRouter"
            ok={settings.hasOpenRouterKey}
            detail={settings.hasOpenRouterKey ? settings.openrouterModel : "Not configured"}
          />
          <ReadinessRow label="Pipeline" ok detail="Paper2Agent.sh available" />
          <ReadinessRow label="Storage" ok detail=".paper2agent/local/secrets.json" />
        </CardContent>
      </Card>
    </div>
  );
}

function CliRow({
  name,
  command,
  description
}: {
  name: string;
  command: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Badge variant="outline" className="font-mono text-xs">
        {command}
      </Badge>
    </div>
  );
}

function ReadinessRow({
  label,
  ok,
  detail
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <Badge variant={ok ? "success" : "outline"}>{ok ? "Ready" : "Needed"}</Badge>
    </div>
  );
}
