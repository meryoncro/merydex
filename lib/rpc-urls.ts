import { FetchRequest, JsonRpcProvider, type JsonRpcPayload, type JsonRpcResult } from "ethers"

// Public Cronos endpoints, tried in order. evm.cronos.org is rate-limited, so
// when it throttles or times out the next endpoint picks the request up.
const MAINNET_RPCS = [
  "https://evm.cronos.org",
  "https://cronos-evm-rpc.publicnode.com",
  "https://cronos.drpc.org",
  "https://rpc.vvs.finance",
]
const TESTNET_RPCS = ["https://evm-t3.cronos.org"]

const RATE_LIMIT_CODES = new Set([-32005, -32029, 429])

export function cronosRpcUrls(chainId = 25, primary?: string | null): string[] {
  const list = chainId === 338 ? TESTNET_RPCS : MAINNET_RPCS
  return [...new Set([primary, ...list].filter((u): u is string => !!u))]
}

function isRateLimited(body: unknown): boolean {
  const items = Array.isArray(body) ? body : [body]
  return items.some((item) => {
    const error = (item as { error?: { code?: number; message?: string } })?.error
    if (!error) return false
    return RATE_LIMIT_CODES.has(Number(error.code)) || /rate.?limit|too many requests/i.test(error.message ?? "")
  })
}

/**
 * A JsonRpcProvider that sends each request to the last healthy endpoint and
 * moves on to the next one on network errors, timeouts or rate limits.
 * Ordinary JSON-RPC errors (e.g. a reverted call) are returned as-is.
 */
export class FailoverRpcProvider extends JsonRpcProvider {
  readonly #urls: string[]
  readonly #timeoutMs: number
  #preferred = 0

  constructor(urls: string[], chainId = 25, options: { timeoutMs?: number; batchMaxCount?: number } = {}) {
    if (urls.length === 0) throw new Error("FailoverRpcProvider needs at least one RPC URL")
    super(urls[0], chainId, { staticNetwork: true, batchMaxCount: options.batchMaxCount ?? 1 })
    this.#urls = urls
    this.#timeoutMs = options.timeoutMs ?? 8000
  }

  override async _send(payload: JsonRpcPayload | JsonRpcPayload[]): Promise<JsonRpcResult[]> {
    let lastError: unknown = new Error("All Cronos RPC endpoints failed")
    for (let attempt = 0; attempt < this.#urls.length; attempt++) {
      const index = (this.#preferred + attempt) % this.#urls.length
      const request = new FetchRequest(this.#urls[index])
      request.body = JSON.stringify(payload)
      request.setHeader("content-type", "application/json")
      request.timeout = this.#timeoutMs
      request.setThrottleParams({ maxAttempts: 1 })
      try {
        const response = await request.send()
        response.assertOk()
        const body = response.bodyJson
        if (isRateLimited(body)) throw new Error(`Rate limited by ${this.#urls[index]}`)
        this.#preferred = index
        return (Array.isArray(body) ? body : [body]) as JsonRpcResult[]
      } catch (error) {
        lastError = error
      }
    }
    throw lastError
  }
}

export function cronosProvider(chainId = 25, primary?: string | null): FailoverRpcProvider {
  return new FailoverRpcProvider(cronosRpcUrls(chainId, primary), chainId)
}
