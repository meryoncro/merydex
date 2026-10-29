import { NextResponse } from "next/server"
import { runDueOrders } from "@/lib/keeper"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

// Runs only orders that are already due, under a DB lock, so extra calls can't
// trade early or twice. Set CRON_SECRET to restrict callers to Vercel Cron.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const result = await runDueOrders()
  return NextResponse.json(result)
}
