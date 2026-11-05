"use client"

import { useEffect, useRef } from "react"
import { QrCode, Wallet, X } from "lucide-react"
import { injectedProvider, walletConnectEnabled, type WalletKind } from "@/lib/wallet-provider"

type Props = {
  open: boolean
  busy: boolean
  onClose: () => void
  onPick: (kind: WalletKind) => void
}

export function WalletPicker({ open, busy, onClose, onPick }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const hasInjected = typeof window !== "undefined" && !!injectedProvider()

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => { if (e.target === dialogRef.current) onClose() }}
      aria-labelledby="wallet-picker-title"
      className="m-auto w-[min(92vw,380px)] rounded-xl border border-[#29e6ff]/40 bg-[#110d22] p-0 text-slate-200 shadow-[0_0_40px_rgba(41,230,255,0.25)] backdrop:bg-[#05030c]/80"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h2 id="wallet-picker-title" className="font-display text-lg font-bold text-white">Connect a wallet</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <button
          disabled={busy || !hasInjected}
          onClick={() => onPick("injected")}
          className="flex items-center gap-3 rounded-lg border border-[#29e6ff]/30 bg-[#0b0816] p-4 text-left transition hover:border-[#29e6ff] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Wallet size={22} className="shrink-0 text-[#29e6ff]" />
          <span className="flex flex-col">
            <span className="font-display font-bold text-white">Browser wallet</span>
            <span className="text-xs leading-relaxed text-slate-400">
              {hasInjected ? "MetaMask, Crypto.com DeFi Wallet extension, Rabby…" : "No browser wallet detected on this device"}
            </span>
          </span>
        </button>

        <button
          disabled={busy || !walletConnectEnabled}
          onClick={() => onPick("walletconnect")}
          className="flex items-center gap-3 rounded-lg border border-[#ff3ea5]/30 bg-[#0b0816] p-4 text-left transition hover:border-[#ff3ea5] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <QrCode size={22} className="shrink-0 text-[#ff3ea5]" />
          <span className="flex flex-col">
            <span className="font-display font-bold text-white">WalletConnect</span>
            <span className="text-xs leading-relaxed text-slate-400">
              {walletConnectEnabled ? "Scan a QR code or open a mobile wallet: DeFi Wallet, Trust, MetaMask Mobile" : "Coming soon"}
            </span>
          </span>
        </button>

        {busy && <p className="text-center text-xs text-slate-400" role="status">Waiting for your wallet…</p>}
      </div>
    </dialog>
  )
}
