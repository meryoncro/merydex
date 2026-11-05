import { NextResponse } from "next/server"
import { getImportedTokens } from "@/lib/tokenlist"

export async function GET() {
  try {
    const tokens = await getImportedTokens()
    return NextResponse.json({ tokens }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ tokens: [], error: (err as Error).message }, { status: 200 })
  }
}
