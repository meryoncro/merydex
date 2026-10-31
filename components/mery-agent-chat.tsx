"use client"

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { ArrowUp, Loader2, RotateCcw, Square, X } from "lucide-react"
import type { MeryAgentUIMessage } from "@/lib/mery-agent"

const LOGO = "/images/mcro-logo.png"

const SUGGESTIONS = ["How is $MERY doing today?", "BTC and ETH price right now", "What is impermanent loss?", "How do I earn 2x score?"]

const TOOL_LABELS: Record<string, { pending: string; done: string }> = {
  "tool-searchTokens": { pending: "Scanning DEX pairs…", done: "Scanned DEX pairs" },
  "tool-getCoinPrices": { pending: "Checking live prices…", done: "Checked live prices" },
  "tool-getGlobalMarket": { pending: "Reading the whole market…", done: "Read the whole market" },
}

export function MeryAgentChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { messages, sendMessage, status, stop, error, regenerate, setMessages } = useChat<MeryAgentUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/agent" }),
  })
  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, status])

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const send = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    sendMessage({ text: trimmed })
    setInput("")
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    send(input)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    send(input)
  }

  if (!open) return null

  return (
    <section
      role="dialog"
      aria-label="Ask MERY, the MERYDEX AI guide"
      className="fixed inset-x-2 bottom-2 z-[66] flex h-[min(620px,calc(100dvh-1rem))] animate-pop-in flex-col overflow-hidden rounded-xl border border-[#f5b82e]/40 bg-[#130a1f] text-slate-100 shadow-[0_0_40px_rgba(245,184,46,.18)] sm:inset-x-auto sm:bottom-24 sm:right-5 sm:h-[min(600px,calc(100dvh-8rem))] sm:w-[400px]"
    >
      <header className="flex items-center gap-3 border-b border-white/10 bg-[#0a0510] px-4 py-3">
        <img src={LOGO} alt="" className="h-9 w-9 [image-rendering:pixelated] drop-shadow-[0_0_8px_rgba(245,184,46,.5)]" />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="font-display text-base font-black uppercase tracking-wide text-[#f5b82e]">Ask MERY</h2>
          <p className="truncate text-xs text-slate-400">Crypto and markets AI guide with live data</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { stop(); setMessages([]) }}
            aria-label="Start a new conversation"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
          >
            <RotateCcw size={16} />
          </button>
        )}
        <button onClick={onClose} aria-label="Close chat" className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-slate-100">
          <X size={18} />
        </button>
      </header>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col justify-end gap-4">
            <div className="flex flex-col gap-1">
              <p className="font-display text-xl font-bold text-slate-100 text-balance">gm! What do you want to know?</p>
              <p className="text-sm leading-relaxed text-slate-400 text-pretty">
                Ask about any token, coin, DeFi concept or market move. I pull live prices when it matters.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-[#f5b82e]/30 bg-[#f5b82e]/5 px-3 py-1.5 text-left text-sm text-slate-200 transition hover:border-[#f5b82e]/70 hover:bg-[#f5b82e]/10"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} />)
        )}

        {status === "submitted" && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 size={14} className="animate-spin text-[#f5b82e]" />
            Thinking…
          </div>
        )}

        {error && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#ff2d95]/40 bg-[#ff2d95]/10 px-3 py-2 text-sm text-slate-200">
            <span>MERY tripped over a cable. Try again?</span>
            <button onClick={() => regenerate()} className="shrink-0 font-display font-bold text-[#f5b82e] hover:underline">
              Retry
            </button>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-2 border-t border-white/10 bg-[#0a0510] px-3 py-3">
        <div className="flex items-end gap-2 rounded-lg border border-white/15 bg-[#130a1f] p-1.5 focus-within:border-[#f5b82e]/60">
          <label htmlFor="mery-agent-input" className="sr-only">Message MERY</label>
          <textarea
            id="mery-agent-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={1000}
            placeholder="Ask about crypto or markets…"
            className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-base leading-snug text-slate-100 placeholder:text-slate-500 focus:outline-none sm:text-sm"
          />
          {busy ? (
            <button type="button" onClick={() => stop()} aria-label="Stop generating" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/10 text-slate-100 transition hover:bg-white/20">
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#f5b82e] text-[#0a0510] transition hover:brightness-110 disabled:opacity-40"
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
        <p className="px-1 text-center text-xs text-slate-500">Not financial advice. Always DYOR.</p>
      </form>
    </section>
  )
}

function ChatMessage({ message }: { message: MeryAgentUIMessage }) {
  const isUser = message.role === "user"

  return (
    <div className={`flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          if (!part.text) return null
          return (
            <div
              key={i}
              className={`max-w-[88%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm leading-relaxed ${
                isUser ? "bg-[#f5b82e] text-[#0a0510]" : "border border-white/10 bg-white/5 text-slate-100"
              }`}
            >
              {part.text}
            </div>
          )
        }
        const label = TOOL_LABELS[part.type]
        if (!label || !("state" in part)) return null
        const done = part.state === "output-available"
        return (
          <div key={i} className="flex items-center gap-1.5 rounded-full border border-[#22e4ff]/30 bg-[#22e4ff]/5 px-2.5 py-1 text-xs text-[#22e4ff]">
            {done ? <span className="h-1.5 w-1.5 rounded-full bg-[#22e4ff]" aria-hidden /> : <Loader2 size={12} className="animate-spin" />}
            {done ? label.done : label.pending}
          </div>
        )
      })}
    </div>
  )
}
