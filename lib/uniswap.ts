import "server-only"
import { FEE_COLLECTOR } from "@/lib/fees"

const UNISWAP_API = "https://trade-api.gateway.uniswap.org/v1"

// Integrator fee taken from the swap output and paid to FEE_COLLECTOR by the Universal Router.
// Uniswap allows up to 500 bps.
const parsedBps = Number.parseInt(process.env.MERYDEX_UNISWAP_FEE_BPS || "80", 10)
export const UNISWAP_FEE_BPS = Number.isInteger(parsedBps) && parsedBps > 0 && parsedBps <= 500 ? parsedBps : 80
export const UNISWAP_FEE_RECIPIENT = FEE_COLLECTOR

export class UniswapError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export async function uniswap<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  const apiKey = process.env.API_KEY_3
  if (!apiKey) throw new UniswapError("Uniswap API key is not configured.", 500)
  const res = await fetch(`${UNISWAP_API}${path}`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-universal-router-version": "2.0",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  })
  const data = (await res.json().catch(() => null)) as (T & { detail?: string; errorCode?: string }) | null
  if (!res.ok || !data) {
    const message = data?.errorCode === "QuoteAmountTooLowError" ? "Amount too small to quote." : data?.detail || data?.errorCode || "Uniswap request failed."
    throw new UniswapError(message, res.status === 404 ? 404 : res.status >= 500 ? 502 : 400)
  }
  return data
}

export const errorResponse = (error: unknown) => {
  const status = error instanceof UniswapError ? error.status : 500
  const message = error instanceof Error ? error.message : "Unexpected error"
  return Response.json({ error: message }, { status })
}

export const isAddress = (value: unknown): value is string => typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)
