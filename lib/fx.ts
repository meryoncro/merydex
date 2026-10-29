export type FxKind = "buy" | "sell" | "swap" | "queue" | "fight" | "win" | "lose" | "draw"
export type FxEvent = { kind: FxKind; label?: string }

const EVENT = "mcro:fx"

/** Fire a platform-wide celebration (trade confirmed, fight result, …). */
export function emitFx(event: FxEvent) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<FxEvent>(EVENT, { detail: event }))
}

export function onFx(handler: (event: FxEvent) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<FxEvent>).detail)
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
