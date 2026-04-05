import { NextResponse } from "next/server";
import { z } from "zod";

import { getSecretsSummary, saveSecrets } from "@/lib/server/secrets";

const payloadSchema = z.object({
  geminiApiKey: z.string().optional().transform((value) => value?.trim()),
  openrouterApiKey: z.string().optional().transform((value) => value?.trim()),
  geminiModel: z.string().min(1).optional().transform((value) => value?.trim()),
  openrouterModel: z.string().min(1).optional().transform((value) => value?.trim()),
  preferredProvider: z.enum(["gemini", "openrouter", "claude"]).optional(),
  langfuseSecretKey: z.string().optional().transform((value) => value?.trim()),
  langfusePublicKey: z.string().optional().transform((value) => value?.trim()),
  langfuseBaseUrl: z.string().optional().transform((value) => value?.trim()),
  langfuseEnabled: z.boolean().optional(),
});

export async function GET() {
  return NextResponse.json(await getSecretsSummary());
}

export async function POST(request: Request) {
  const payload = payloadSchema.parse(await request.json());
  await saveSecrets(payload);
  return NextResponse.json(await getSecretsSummary());
}
