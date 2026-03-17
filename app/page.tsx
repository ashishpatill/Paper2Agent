import { PaperStudio } from "@/components/paper-studio";
import { listJobs } from "@/lib/server/jobs";
import { getSecretsSummary } from "@/lib/server/secrets";
import { buildDefaultSkillGraph } from "@/lib/skills/graph";

export default async function HomePage() {
  const [jobs, settings] = await Promise.all([listJobs(), getSecretsSummary()]);

  return (
    <PaperStudio
      initialJobs={jobs}
      initialSettings={settings}
      defaultSkillGraph={buildDefaultSkillGraph()}
    />
  );
}
