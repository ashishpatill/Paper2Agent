import { consumeFeedbackForStep } from "../lib/server/feedback";

const [jobId, displayedStepNumberRaw] = process.argv.slice(2);

if (!jobId || !displayedStepNumberRaw) {
  process.stderr.write("Usage: consume-feedback.ts <jobId> <displayedStepNumber>\n");
  process.exit(1);
}

const displayedStepNumber = Number.parseInt(displayedStepNumberRaw, 10);

if (!Number.isFinite(displayedStepNumber) || displayedStepNumber <= 0) {
  process.stderr.write("displayedStepNumber must be a positive integer\n");
  process.exit(1);
}

const overlay = await consumeFeedbackForStep(jobId, displayedStepNumber);
if (overlay) {
  process.stdout.write(`${overlay}\n`);
}
