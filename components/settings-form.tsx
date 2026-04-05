"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, Sparkles, AlertTriangle, Globe, Bot, Key } from "lucide-react";

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

const PROVIDER_INFO: Record<string, { name: string; icon: React.ReactNode; desc: string; keyHint: string; modelHint: string }> = {
  claude: {
    name: "Claude Code (CLI)",
    icon: <Bot className="h-4 w-4" />,
    desc: "Uses your Claude Code CLI subscription for ALL pipeline steps. Best quality, no API key needed.",
    keyHint: "No key — uses your Claude subscription",
    modelHint: "claude-sonnet-4-20250514"
  },
  openrouter: {
    name: "OpenRouter",
    icon: <Globe className="h-4 w-4" />,
    desc: "Uses OpenRouter API for ALL pipeline steps. Supports many models including Claude, GPT, Qwen, etc.",
    keyHint: "Requires OpenRouter API key",
    modelHint: "anthropic/claude-sonnet-4-20250514 or any model ID"
  },
  gemini: {
    name: "Gemini",
    icon: <Sparkles className="h-4 w-4" />,
    desc: "Uses Gemini API for ALL pipeline steps. Fast and cost-effective.",
    keyHint: "Requires Gemini API key",
    modelHint: "gemini-2.5-flash"
  }
};

export function SettingsForm({ initialSettings }: { initialSettings: SecretsSummary }) {
  const [settings, setSettings] = useState(initialSettings);
  const [isSaving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pipelineProvider, setPipelineProvider] = useState(
    initialSettings.preferredProvider === "gemini" && !initialSettings.hasOpenRouterKey
      ? "claude"
      : initialSettings.preferredProvider
  );

  async function handleSave(formData: FormData) {
    setError(null);
    setSaved(false);

    const geminiKey = String(formData.get("geminiApiKey") ?? "").trim();
    const orKey = String(formData.get("openrouterApiKey") ?? "").trim();
    const provider = String(formData.get("pipelineProvider") ?? "claude");

    const payload: Record<string, string | undefined> = {
      geminiModel: String(formData.get("geminiModel") ?? ""),
      openrouterModel: String(formData.get("openrouterModel") ?? ""),
      preferredProvider: provider
    };
    if (geminiKey) payload.geminiApiKey = geminiKey;
    if (orKey) payload.openrouterApiKey = orKey;

    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      setError(await response.text());
      return;
    }

    const next = (await response.json()) as SecretsSummary;
    setSettings(next);
    setPipelineProvider(provider);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const providerInfo = PROVIDER_INFO[pipelineProvider] || PROVIDER_INFO.claude;

  return (
    <div className="space-y-6">
      {/* AI Pipeline Provider — the main setting */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {providerInfo.icon}
            AI Pipeline Provider
          </CardTitle>
          <CardDescription>
            This provider runs ALL 13 pipeline steps. Your choice determines which AI service is used from start to end.
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
            <div className="space-y-2">
              <Label>Which AI service should the pipeline use?</Label>
              <Select
                value={pipelineProvider}
                onValueChange={(v) => setPipelineProvider(v)}
                name="pipelineProvider"
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      <div>
                        <p className="text-sm font-medium">Claude Code (CLI)</p>
                        <p className="text-[11px] text-muted-foreground">Uses your Claude subscription — best quality</p>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="openrouter">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      <div>
                        <p className="text-sm font-medium">OpenRouter</p>
                        <p className="text-[11px] text-muted-foreground">API-based — supports Claude, GPT, Qwen, etc.</p>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="gemini">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      <div>
                        <p className="text-sm font-medium">Gemini</p>
                        <p className="text-[11px] text-muted-foreground">API-based — fast and cost-effective</p>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Provider-specific info */}
            <div className={`rounded-lg border px-4 py-3 text-sm ${
              pipelineProvider === "claude"
                ? "border-primary/30 bg-primary/5"
                : pipelineProvider === "openrouter" && !settings.hasOpenRouterKey
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-border/50 bg-muted/30"
            }`}>
              <div className="flex items-start gap-2">
                {pipelineProvider !== "claude" && !((pipelineProvider === "openrouter" && settings.hasOpenRouterKey) || (pipelineProvider === "gemini" && settings.hasGeminiKey)) ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                )}
                <div>
                  <p className="font-medium">{providerInfo.name}</p>
                  <p className="text-xs text-muted-foreground">{providerInfo.desc}</p>
                  <p className="mt-1 text-xs font-mono text-muted-foreground">
                    {providerInfo.keyHint} · Model: {providerInfo.modelHint}
                  </p>
                </div>
              </div>
            </div>

            {/* API Keys — only shown when OpenRouter or Gemini is selected */}
            {pipelineProvider !== "claude" && (
              <div className="space-y-4 rounded-lg border border-border/50 bg-card p-4">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Key className="h-3.5 w-3.5" />
                  Required API Key
                </p>

                {pipelineProvider === "openrouter" && (
                  <div className="space-y-2">
                    <Label htmlFor="openrouterApiKey">OpenRouter API Key</Label>
                    <Input
                      id="openrouterApiKey"
                      name="openrouterApiKey"
                      type="password"
                      placeholder={settings.hasOpenRouterKey ? "Saved locally — leave blank to keep" : "sk-or-v1-..."}
                    />
                    {settings.hasOpenRouterKey && (
                      <p className="flex items-center gap-1 text-xs text-success">
                        <CheckCircle2 className="h-3 w-3" /> Key is saved
                      </p>
                    )}
                  </div>
                )}

                {pipelineProvider === "gemini" && (
                  <div className="space-y-2">
                    <Label htmlFor="geminiApiKey">Gemini API Key</Label>
                    <Input
                      id="geminiApiKey"
                      name="geminiApiKey"
                      type="password"
                      placeholder={settings.hasGeminiKey ? "Saved locally — leave blank to keep" : "AIza..."}
                    />
                    {settings.hasGeminiKey && (
                      <p className="flex items-center gap-1 text-xs text-success">
                        <CheckCircle2 className="h-3 w-3" /> Key is saved
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor={pipelineProvider === "openrouter" ? "openrouterModel" : "geminiModel"}>Model</Label>
                  <Input
                    id={pipelineProvider === "openrouter" ? "openrouterModel" : "geminiModel"}
                    name={pipelineProvider === "openrouter" ? "openrouterModel" : "geminiModel"}
                    defaultValue={pipelineProvider === "openrouter" ? settings.openrouterModel : settings.geminiModel}
                    placeholder={pipelineProvider === "openrouter" ? "anthropic/claude-sonnet-4-20250514" : "gemini-2.5-flash"}
                  />
                </div>
              </div>
            )}

            {/* Claude note */}
            {pipelineProvider === "claude" && (
              <div className="space-y-4 rounded-lg border border-border/50 bg-card p-4">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Bot className="h-3.5 w-3.5" />
                  Claude Code CLI
                </p>
                <p className="text-xs text-muted-foreground">
                  No API key needed. The pipeline uses your <code className="font-mono text-xs">claude</code> CLI subscription for all steps. Make sure it&apos;s installed and authenticated.
                </p>
              </div>
            )}

            {/* Hidden fields to always send models */}
            <input type="hidden" name="geminiModel" value={settings.geminiModel} />
            <input type="hidden" name="openrouterModel" value={settings.openrouterModel} />

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

      {/* Runtime Readiness */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Runtime Readiness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ReadinessRow
            label={`Pipeline: ${providerInfo.name}`}
            ok={
              pipelineProvider === "claude" ||
              (pipelineProvider === "openrouter" && settings.hasOpenRouterKey) ||
              (pipelineProvider === "gemini" && settings.hasGeminiKey)
            }
            detail={
              pipelineProvider === "claude"
                ? "Uses Claude CLI subscription"
                : pipelineProvider === "openrouter"
                ? settings.hasOpenRouterKey
                  ? `Using ${settings.openrouterModel}`
                  : "API key required"
                : settings.hasGeminiKey
                ? `Using ${settings.geminiModel}`
                : "API key required"
            }
            highlight
          />
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
          <ReadinessRow label="Storage" ok detail=".paper2agent/local/secrets.json" />
        </CardContent>
      </Card>
    </div>
  );
}

function ReadinessRow({
  label,
  ok,
  detail,
  highlight
}: {
  label: string;
  ok: boolean;
  detail: string;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${highlight ? "border-primary/30 bg-primary/5" : "border-border/50"}`}>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <Badge variant={ok ? "success" : "outline"}>{ok ? "Ready" : "Needed"}</Badge>
    </div>
  );
}
