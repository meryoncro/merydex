export const RUN_HOUR_UTC = 14
export const MIN_RUNS = 2
export const MAX_RUNS = 365
export const RUN_PRESETS = [7, 14, 30, 60, 90] as const

export type RecurringSide = "buy" | "sell"

export type RecurringOrder = {
  id: number
  side: RecurringSide
  tokenAddress: string
  tokenSymbol: string
  tokenDecimals: number
  amountPerRun: string
  runsTotal: number
  runsDone: number
  slippageBps: number
  status: "active" | "completed" | "cancelled" | "failed"
  nextRunAt: string
  failCount: number
  lastError: string | null
  lastTx: string | null
  createdAt: string
}

export type RecurringState = {
  keeper: string | null
  runHourUtc: number
  orders: RecurringOrder[]
}

export type RecurringOrderTerms = {
  owner: string
  side: RecurringSide
  tokenAddress: string
  tokenSymbol: string
  amountPerRun: string
  runs: number
  slippageBps: number
  keeper: string
  issuedAt: string
}

/** Exact text the wallet signs to authorize an order. The server rebuilds it to verify. */
export function recurringOrderMessage(t: RecurringOrderTerms): string {
  const spend = t.side === "buy" ? `${t.amountPerRun} WCRO` : `${t.amountPerRun} ${t.tokenSymbol}`
  const action = t.side === "buy" ? `Buy ${t.tokenSymbol} with ${spend}` : `Sell ${spend} for CRO`
  return [
    "MERYDEX recurring order",
    `Wallet: ${t.owner.toLowerCase()}`,
    `Action: ${action}`,
    `Token: ${t.tokenAddress.toLowerCase()}`,
    `Schedule: daily at ${RUN_HOUR_UTC}:00 UTC, ${t.runs} runs`,
    `Max slippage: ${(t.slippageBps / 100).toFixed(2)}%`,
    `Keeper: ${t.keeper.toLowerCase()}`,
    `Issued: ${t.issuedAt}`,
  ].join("\n")
}

export function cancelOrderMessage(owner: string, orderId: number, issuedAt: string): string {
  return ["MERYDEX cancel recurring order", `Wallet: ${owner.toLowerCase()}`, `Order: #${orderId}`, `Issued: ${issuedAt}`].join("\n")
}

/** Next scheduled run strictly after `after`. */
export function nextRunSlot(after: Date): Date {
  const slot = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate(), RUN_HOUR_UTC))
  if (slot <= after) slot.setUTCDate(slot.getUTCDate() + 1)
  return slot
}
