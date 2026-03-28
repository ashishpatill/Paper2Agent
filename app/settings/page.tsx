import { SettingsForm } from "@/components/settings-form";
import { getSecretsSummary } from "@/lib/server/secrets";

export default async function SettingsPage() {
  const settings = await getSecretsSummary();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure provider keys, CLI integrations, and pipeline preferences.
        </p>
      </div>

      <SettingsForm initialSettings={settings} />
    </div>
  );
}
