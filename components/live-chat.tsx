"use client"

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import useSWR from "swr"
import { BrowserProvider } from "ethers"
import { Loader2, MessageSquare, Send, ShieldCheck, Wallet } from "lucide-react"
import { CHAT_MAX_LENGTH, chatSignInMessage, type ChatMessage, type ChatRoom } from "@/lib/chat"

interface ChatFeed {
  messages: ChatMessage[]
  activeChatters: number
}

const fetchFeed = async (url: string): Promise<ChatFeed> => {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error("Chat unavailable")
  return res.json()
}

const tokenKey = (address: string) => `merydex-chat:${address.toLowerCase()}`
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const walletHue = (a: string) => parseInt(a.slice(2, 8), 16) % 360
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

interface LiveChatProps {
  room: ChatRoom
  title: string
  account: string | null
  onConnect: () => void
}

export function LiveChat({ room, title, account, onConnect }: LiveChatProps) {
  const me = account?.toLowerCase() ?? null
  const { data, error, mutate } = useSWR(`/api/chat?room=${room}`, fetchFeed, { refreshInterval: 3000, revalidateOnFocus: true })
  const [token, setToken] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [signingIn, setSigningIn] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    setToken(me ? sessionStorage.getItem(tokenKey(me)) : null)
    setNotice(null)
  }, [me])

  const messages = data?.messages ?? []
  const lastId = messages.at(-1)?.id

  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [lastId])

  const onScroll = () => {
    const el = listRef.current
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  const signIn = async () => {
    if (!me) return onConnect()
    const ethereum = (window as Window & { ethereum?: unknown }).ethereum
    if (!ethereum) return setNotice("Install a compatible wallet to chat.")
    setSigningIn(true); setNotice(null)
    try {
      const signer = await new BrowserProvider(ethereum as ConstructorParameters<typeof BrowserProvider>[0]).getSigner()
      const address = await signer.getAddress()
      const issuedAt = new Date().toISOString()
      const signature = await signer.signMessage(chatSignInMessage(address, issuedAt))
      const res = await fetch("/api/chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, issuedAt, signature }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Sign-in failed")
      sessionStorage.setItem(tokenKey(json.address), json.token)
      setToken(json.token)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign-in failed"
      setNotice(/rejected|denied|4001/i.test(msg) ? "Signature cancelled." : msg)
    } finally {
      setSigningIn(false)
    }
  }

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    const body = draft.trim()
    if (!body || !token || !me || sending) return
    setSending(true); setNotice(null)
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ room, body }),
      })
      const json = await res.json()
      if (res.status === 401) {
        sessionStorage.removeItem(tokenKey(me))
        setToken(null)
      }
      if (!res.ok) throw new Error(json.error ?? "Message not sent")
      setDraft("")
      stickToBottom.current = true
      mutate((prev) => (prev ? { ...prev, messages: [...prev.messages, json.message] } : prev), { revalidate: true })
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Message not sent")
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    send()
  }

  return (
    <aside aria-label={title} className="flex h-[560px] flex-col overflow-hidden rounded-xl border border-[#22e4ff]/25 bg-[#0d0818]/90 shadow-[0_0_24px_rgba(34,228,255,0.08)] lg:sticky lg:top-24">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-[#22e4ff]" aria-hidden="true" />
          <h2 className="font-display text-xs font-black uppercase tracking-wider">{title}</h2>
        </div>
        <span className="flex items-center gap-1.5 text-[13px] text-slate-300">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d6ff2b] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#d6ff2b]" />
          </span>
          {data ? `${data.activeChatters} active` : "Live"}
        </span>
      </header>

      <div ref={listRef} onScroll={onScroll} role="log" aria-live="polite" className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {!data && !error && (
          <div className="flex flex-1 items-center justify-center text-slate-400"><Loader2 size={18} className="animate-spin" aria-label="Loading chat" /></div>
        )}
        {error && !data && <p className="m-auto text-center text-sm text-slate-400">Chat is unavailable right now.</p>}
        {data && messages.length === 0 && (
          <p className="m-auto max-w-[220px] text-pretty text-center text-sm leading-6 text-slate-400">No messages yet. Be the first to say gm.</p>
        )}
        {messages.map((m) => {
          const mine = m.address === me
          return (
            <div key={m.id} className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="font-mono font-bold" style={{ color: mine ? "#d6ff2b" : `hsl(${walletHue(m.address)} 90% 70%)` }}>
                  {mine ? "You" : short(m.address)}
                </span>
                <time dateTime={m.createdAt}>{clock(m.createdAt)}</time>
              </div>
              <p className={`max-w-[85%] break-words rounded-lg px-3 py-2 text-sm leading-relaxed ${mine ? "bg-[#d6ff2b]/15 text-[#f1ffc4]" : "bg-white/5 text-slate-200"}`}>
                {m.body}
              </p>
            </div>
          )
        })}
      </div>

      <div className="border-t border-white/10 p-3">
        {notice && <p role="status" className="mb-2 text-xs text-[#ff2d95]">{notice}</p>}
        {!me ? (
          <button type="button" onClick={onConnect} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#22e4ff] px-4 py-2.5 font-display text-xs font-black uppercase tracking-wider text-[#0d0818] transition hover:brightness-110">
            <Wallet size={15} aria-hidden="true" /> Connect wallet to chat
          </button>
        ) : !token ? (
          <button type="button" onClick={signIn} disabled={signingIn} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#d6ff2b] px-4 py-2.5 font-display text-xs font-black uppercase tracking-wider text-[#0d0818] transition hover:brightness-110 disabled:opacity-60">
            {signingIn ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}
            {signingIn ? "Check your wallet…" : "Sign in to chat (free)"}
          </button>
        ) : (
          <form onSubmit={send} className="flex items-center gap-2">
            <label htmlFor={`chat-${room}`} className="sr-only">Message</label>
            <input
              id={`chat-${room}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, CHAT_MAX_LENGTH))}
              onKeyDown={onKeyDown}
              maxLength={CHAT_MAX_LENGTH}
              placeholder="Say something…"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:border-[#22e4ff]/60 focus:outline-none"
            />
            <button type="submit" disabled={!draft.trim() || sending} aria-label="Send message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#22e4ff] text-[#0d0818] transition hover:brightness-110 disabled:opacity-40">
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        )}
      </div>
    </aside>
  )
}
