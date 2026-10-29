import { NextResponse } from "next/server"
import { createHash, timingSafeEqual } from "node:crypto"
import { runDueOrders } from "@/lib/keeper"

const digest = (v: string) => createHash("sha256").update(v).digest()

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

// Runs only orders that are already due, under a DB lock, so extra calls can't
// trade early or twice. Fails closed: without CRON_SECRET nobody can trigger it.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const given = req.headers.get("authorization") ?? ""
  if (!secret || !timingSafeEqual(digest(given), digest(`Bearer ${secret}`))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const result = await runDueOrders()
  return NextResponse.json(result)
}
