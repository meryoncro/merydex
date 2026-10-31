"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import { X } from "lucide-react"
import { onFx, type FxEvent, type FxKind } from "@/lib/fx"
import { MeryAgentChat } from "@/components/mery-agent-chat"

const LOGO = "/images/mcro-logo.png"

type Particle = { x: number; delay: number; dur: number; size: number; spin: number }
type Burst = { id: number; kind: FxKind; label: string; particles: Particle[] }

const BURST_META: Partial<Record<FxKind, { title: string; color: string; dir: "up" | "down" | "out"; ms: number }>> = {
  buy: { title: "BUY CONFIRMED", color: "#3dd68c", dir: "up", ms: 2400 },
  sell: { title: "SOLD", color: "#f0616d", dir: "down", ms: 2400 },
  swap: { title: "SWAP DONE", color: "#f2b33d", dir: "up", ms: 2200 },
  fight: { title: "FIGHT!", color: "#8b93a7", dir: "out", ms: 1400 },
  win: { title: "VICTORY", color: "#f2b33d", dir: "up", ms: 2800 },
  lose: { title: "K.O.", color: "#f0616d", dir: "down", ms: 2400 },
  draw: { title: "DRAW", color: "#f2b33d", dir: "out", ms: 2000 },
}

const REACTIONS: Record<FxKind, { line: string; anim: string }> = {
  buy: { line: "LFG! Bag acquired.", anim: "animate-mascot-hop" },
  sell: { line: "Profits secured, ser.", anim: "animate-mascot-spin" },
  swap: { line: "Smooth swap.", anim: "animate-mascot-hop" },
  queue: { line: "Hunting a rival…", anim: "animate-mascot-wiggle" },
  fight: { line: "FIGHT FIGHT FIGHT!", anim: "animate-mascot-hop" },
  win: { line: "GG EZ. Both NFTs yours!", anim: "animate-mascot-spin" },
  lose: { line: "Rekt… run it back?", anim: "animate-mascot-shake" },
  draw: { line: "Even match. Respect.", anim: "animate-mascot-wiggle" },
}

const IDLE_LINES = ["gm degen", "WAGMI", "Buy the dip?", "Check the Leaders board", "Arena is open", "Chart looking spicy", "Click me!", "Not financial advice"]
const CLICK_LINES = ["Hehe, that tickles", "Go ape something", "I'm the MCRO coin!", "Up only (maybe)", "Swap safe out there"]

const MASCOT = 56
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * 100,
    delay: Math.random() * 0.5,
    dur: 1.3 + Math.random() * 0.9,
    size: 22 + Math.random() * 26,
    spin: (Math.random() > 0.5 ? 1 : -1) * (240 + Math.random() * 480),
  }))
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return reduced
}

export function McroFx() {
  const reduced = useReducedMotion()
  const [bursts, setBursts] = useState<Burst[]>([])
  const nextId = useRef(0)

  useEffect(() => onFx((event: FxEvent) => {
    const meta = BURST_META[event.kind]
    if (!meta) return
    const id = ++nextId.current
    const particles = reduced ? [] : makeParticles(event.kind === "win" ? 30 : event.kind === "fight" ? 0 : 18)
    setBursts(b => [...b.slice(-2), { id, kind: event.kind, label: event.label ?? "", particles }])
    window.setTimeout(() => setBursts(b => b.filter(x => x.id !== id)), meta.ms)
  }), [reduced])

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-live="polite">
        {bursts.map(burst => {
          const meta = BURST_META[burst.kind]!
          return (
            <div key={burst.id} className="absolute inset-0">
              <div className="absolute inset-0 animate-fx-flash" style={{ background: `radial-gradient(circle at 50% 45%, ${meta.color}33, transparent 60%)` }} />
              {burst.particles.map((p, i) => (
                <img
                  key={i}
                  src={LOGO}
                  alt=""
                  className={`absolute [image-rendering:pixelated] ${meta.dir === "down" ? "top-0 animate-coin-fall" : "bottom-0 animate-coin-rise"}`}
                  style={{ left: `${p.x}%`, width: p.size, height: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, "--spin": `${p.spin}deg` } as CSSProperties}
                />
              ))}
              <div className="absolute inset-x-0 top-[38%] flex flex-col items-center gap-2 px-4 text-center animate-fx-banner">
                <div className="font-display text-5xl font-bold italic tracking-tight sm:text-7xl" style={{ color: meta.color, textShadow: `0 0 18px ${meta.color}, 0 4px 0 #0e0f12` }}>{meta.title}</div>
                {burst.label && <div className="rounded-md border border-white/15 bg-[#0e0f12]/85 px-4 py-2 font-display text-sm font-bold text-white sm:text-base">{burst.label}</div>}
              </div>
            </div>
          )
        })}
      </div>
      <Mascot reduced={reduced} />
    </>
  )
}

function Mascot({ reduced }: { reduced: boolean }) {
  const [hidden, setHidden] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [facingLeft, setFacingLeft] = useState(false)
  const [bubble, setBubble] = useState<string | null>(null)
  const [anim, setAnim] = useState("")
  const [chatOpen, setChatOpen] = useState(false)
  const chatOpenRef = useRef(false)
  chatOpenRef.current = chatOpen
  const tiltRef = useRef<HTMLDivElement>(null)
  const posRef = useRef<{ x: number; y: number } | null>(null)
  const bubbleTimer = useRef<number>(0)
  const animTimer = useRef<number>(0)

  useEffect(() => setHidden(window.localStorage.getItem("mcro:mascot-hidden") === "1"), [])

  const say = (line: string, ms = 2600) => {
    setBubble(line)
    window.clearTimeout(bubbleTimer.current)
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms)
  }
  const play = (cls: string) => {
    setAnim("")
    window.requestAnimationFrame(() => setAnim(cls))
    window.clearTimeout(animTimer.current)
    animTimer.current = window.setTimeout(() => setAnim(""), 1200)
  }

  const moveTo = (x: number, y: number) => {
    const prev = posRef.current
    if (prev) setFacingLeft(x < prev.x)
    posRef.current = { x, y }
    setPos({ x, y })
  }

  const isSmallScreen = () => window.innerWidth < 640
  const homeSpot = () => isSmallScreen()
    ? { x: window.innerWidth - MASCOT - 12, y: window.innerHeight - MASCOT - 12 }
    : { x: window.innerWidth - MASCOT - 20, y: window.innerHeight - MASCOT - 20 }

  // Wander the viewport; stay parked when the user prefers reduced motion.
  useEffect(() => {
    if (hidden) return
    const home = homeSpot()
    moveTo(home.x, home.y)
    if (reduced) return
    let hops = 0
    const wander = () => {
      // Small screens have no free space to roam, so the mascot stays parked in its corner.
      // It also stays home while its chat is open so the panel stays anchored to it.
      if (isSmallScreen() || chatOpenRef.current) { const s = homeSpot(); moveTo(s.x, s.y); return }
      const w = window.innerWidth, h = window.innerHeight
      moveTo(16 + Math.random() * Math.max(0, w - MASCOT - 32), 96 + Math.random() * Math.max(0, h - MASCOT - 120))
      if (++hops % 3 === 0) say(pick(IDLE_LINES), 2200)
    }
    const t = window.setInterval(wander, 6500)
    const onResize = () => { const s = homeSpot(); moveTo(s.x, s.y) }
    window.addEventListener("resize", onResize)
    return () => { window.clearInterval(t); window.removeEventListener("resize", onResize) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, reduced])

  // Lean toward the cursor so it feels like it is watching you.
  useEffect(() => {
    if (hidden || reduced) return
    let frame = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const p = posRef.current, el = tiltRef.current
        if (!p || !el) return
        const dx = e.clientX - (p.x + MASCOT / 2), dy = e.clientY - (p.y + MASCOT / 2)
        el.style.setProperty("--tilt", `${Math.max(-16, Math.min(16, dx / 30))}deg`)
        el.style.setProperty("--lean", `${Math.max(-5, Math.min(5, dy / 60))}px`)
      })
    }
    window.addEventListener("pointermove", onMove)
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(frame) }
  }, [hidden, reduced])

  // React to trades and fights; big moments pull the coin to the centre stage.
  useEffect(() => onFx(event => {
    const r = REACTIONS[event.kind]
    say(r.line)
    if (!reduced) play(r.anim)
    if (!reduced && !isSmallScreen() && !chatOpenRef.current && (event.kind === "win" || event.kind === "buy" || event.kind === "fight")) {
      moveTo(window.innerWidth / 2 - MASCOT / 2, Math.min(window.innerHeight * 0.62, window.innerHeight - MASCOT - 24))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [reduced])

  const closeChat = useCallback(() => setChatOpen(false), [])
  const toggleChat = () => {
    if (!chatOpen) { const s = homeSpot(); moveTo(s.x, s.y) }
    setChatOpen(o => !o)
    setBubble(null)
    if (!reduced) play("animate-mascot-hop")
  }

  const hide = () => { setChatOpen(false); setHidden(true); window.localStorage.setItem("mcro:mascot-hidden", "1") }
  const show = () => { setHidden(false); window.localStorage.removeItem("mcro:mascot-hidden") }

  if (hidden) {
    return (
      <button onClick={show} aria-label="Bring back the MCRO mascot" className="fixed bottom-3 right-3 z-[65] flex h-9 w-9 items-center justify-center rounded-full border border-[#f2b33d]/40 bg-[#16181d] opacity-70 transition hover:opacity-100">
        <img src={LOGO} alt="" className="h-6 w-6 [image-rendering:pixelated]" />
      </button>
    )
  }
  if (!pos) return null

  return (
    <>
    <MeryAgentChat open={chatOpen} onClose={closeChat} />
    <div
      className={`group fixed left-0 top-0 z-[65] transition-transform ease-in-out ${chatOpen ? "max-sm:hidden" : ""}`}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, transitionDuration: reduced ? "0ms" : "2400ms" }}
    >
      {bubble && (
        <div className={`absolute bottom-full mb-2 w-max max-w-[200px] animate-pop-in rounded-md border border-[#f2b33d]/50 bg-[#16181d] px-3 py-1.5 font-display text-sm font-bold text-white ${pos.x > (typeof window !== "undefined" ? window.innerWidth / 2 : 0) ? "right-0" : "left-0"}`}>
          {bubble}
        </div>
      )}
      <button
        onClick={hide}
        aria-label="Hide the MCRO mascot"
        className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#0e0f12] text-slate-300 opacity-100 ring-1 ring-white/20 transition group-hover:opacity-100 focus-visible:opacity-100 sm:opacity-0"
      >
        <X size={12} />
      </button>
      <button
        onClick={toggleChat}
        aria-label={chatOpen ? "Close the MERY AI chat" : "Ask MERY, the AI guide, about crypto and markets"}
        aria-expanded={chatOpen}
        className="block cursor-pointer rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f2b33d]"
      >
        <div ref={tiltRef} className="mascot-tilt">
          <div className={reduced ? "" : anim || "animate-mascot-bob"}>
            <img
              src={LOGO}
              alt=""
              width={MASCOT}
              height={MASCOT}
              className="h-12 w-12 [image-rendering:pixelated] sm:h-14 sm:w-14"
              style={{ transform: facingLeft ? "scaleX(-1)" : undefined }}
            />
          </div>
        </div>
      </button>
    </div>
    </>
  )
}
