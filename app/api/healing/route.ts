import { NextResponse } from "next/server";

import { getHealingStats } from "@/lib/server/self-healing";

export async function GET() {
  try {
    const stats = await getHealingStats();
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json({
      totalAttempts: 0,
      successfulRecoveries: 0,
      overallSuccessRate: 0,
      mostCommonFailures: [],
      topSolutions: []
    });
  }
}
