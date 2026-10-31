"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, ArrowDown, ArrowDownUp, ArrowUpRight, BarChart3, ChevronDown, CircleDollarSign, Coins, Copy, Crown, Droplets, ExternalLink, Fuel, Hand, HandFist, ImageIcon, Loader2, Menu, RefreshCw, Scissors, Search, Settings2, ShieldCheck, ShoppingCart, Skull, Sparkles, Swords, Tag, TrendingUp, Trophy, Users, Wallet, X, Zap } from "lucide-react"
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits, parseUnits } from "ethers"
import { TOKENS, getTokenLogoUrl, getTokenBySymbol, getRoutingAddress, type Token } from "@/lib/tokens"
import { isMery } from "@/lib/score"
import { ACTIVE_CHAIN } from "@/lib/chains"
import { isWrapPair, wrapCRO, unwrapCRO } from "@/lib/swap"
import { fetchMarketData, fetchChainStats, fetchTrending, formatPrice, formatChange, formatUsd, formatGasFee, formatCount, type MarketMap, type ChainStats, type TrendingToken } from "@/lib/market"
import { fetchBalances, formatBalance, type BalanceMap } from "@/lib/balances"
import { fetchCollection, fetchListings, fetchWalletNfts, buyListing, ensureListingApproval, listingUrl, croFormat, NATIVE_CURRENCY, MERY_SLUG, ARENA_COLLECTIONS, isArenaCollection, fetchArenaNfts, arenaNftName, type ArenaCollection, type ArenaNft, type Collection, type Listing, type WalletNft } from "@/lib/ebisus"
import { joinArena, leaveArena, getMatch, getArenaStats, getArenaHistory, shortAddr, RPS_MOVES, type ArenaMatch, type ArenaStats, type ArenaMode, type RpsMove, type NftRef } from "@/lib/arena"
import { DegenArcade, ScoreBoost } from "@/components/degen-arcade"
import { SwapBox, type SwapMode, type SwapSizing } from "@/components/swap-box"
import { ReferralPanel, useReferralCapture } from "@/components/referral-panel"
import { ProTerminal } from "@/components/pro-terminal"
import { PredictHub } from "@/components/predict-hub"
import { LiveChat } from "@/components/live-chat"
import { McroFx } from "@/components/mcro-fx"
import { NetworkSwitch } from "@/components/network-switch"
import { emitFx } from "@/lib/fx"
import { recordTrade, fetchLeaderboard, shortWallet, formatVolume, timeAgo, type LeaderRow, type LeaderboardTotals } from "@/lib/leaderboard"

const tabs = ["Overview", "Swap", "Pro", "Predict", "Markets", "NFTs", "Game", "Portfolio", "Referral"]

// Display order for the market tables. Prices come from the live /api/market proxy.
const MARKET_TOKENS = [0, 2, 1, 3, 5, 7, 8, 9, 10, 11].map((i) => TOKENS[i])

interface MarketRow {
  token: Token
  price: string
  change: string
  volume: string
  liquidity: string
  positive: boolean
}

function buildMarketRows(market: MarketMap): MarketRow[] {
  return MARKET_TOKENS.map((token) => {
    const stat = market[token.address.toLowerCase()]
    return {
      token,
      price: formatPrice(stat?.priceUsd ?? null),
      change: formatChange(stat?.change24h ?? null),
      volume: formatUsd(stat?.volume24h ?? null),
      liquidity: formatUsd(stat?.liquidityUsd ?? null),
      positive: (stat?.change24h ?? 0) >= 0,
    }
  })
}

// Maps lowercased token address -> live logo URL sourced from DexScreener.
const LogoContext = createContext<Record<string, string>>({})

function TokenIcon({ token, size = "md" }: { token: Token; size?: "sm" | "md" | "lg" }) {
  const dimensions = size === "lg" ? "h-12 w-12 text-sm" : size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-xs"
  const [failed, setFailed] = useState(false)
  const logos = useContext(LogoContext)
  const logo = token.logoURI ?? logos[token.address.toLowerCase()] ?? getTokenLogoUrl(token)

  // Reset the failure flag when the resolved logo changes (e.g. market loads).
  useEffect(() => setFailed(false), [logo])

  if (logo && !failed) {
    return (
      <img
        src={logo || "/placeholder.svg"}
        alt={`${token.symbol} logo`}
        onError={() => setFailed(true)}
        className={`${dimensions} shrink-0 rounded-md bg-[#171230] object-cover ring-2 ring-white/10`}
        style={{ boxShadow: `0 0 12px ${token.color}66` }}
      />
    )
  }

  return <div className={`${dimensions} flex shrink-0 items-center justify-center rounded-md font-bold text-white ring-2 ring-white/10`} style={{ background: token.color, boxShadow: `0 0 12px ${token.color}66` }}>{token.symbol.slice(0, 2)}</div>
}

// Arcade section eyebrow label
function Eyebrow({ children, color = "cyan" }: { children: React.ReactNode; color?: "cyan" | "pink" | "lime" }) {
  const c = color === "pink" ? "text-[#ff3d7f]" : color === "lime" ? "text-[#3dff9a]" : "text-[#29e6ff]"
  return <div className={`mb-3 font-display text-xs font-bold tracking-normal ${c}`}>{children}</div>
}

// Live price ticker styled like an arcade scoreboard
function Ticker({ rows }: { rows: MarketRow[] }) {
  const items = rows.length ? rows : MARKET_TOKENS.map((token) => ({ token, price: "----", change: "--", volume: "", liquidity: "", positive: true }))
  const loop = [...items, ...items]
  return (
    <div className="relative z-10 overflow-hidden border-y border-[#ff3d7f]/25 bg-[#0b0816]/80 py-2">
      <div className="flex w-max animate-marquee gap-8 whitespace-nowrap font-display text-xs">
        {loop.map((row, i) => (
          <span key={i} className="flex items-center gap-2 text-slate-300">
            <span className="font-bold text-white">{row.token.symbol}</span>
            <span className="text-[#29e6ff]">{row.price}</span>
            <span className={row.positive ? "text-[#3dff9a]" : "text-[#ff3d7f]"}>{row.change}</span>
            <span className="text-[#ff3d7f]">·</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function Page() {
  const [activeTab, setActiveTab] = useState("Overview")
  const [account, setAccount] = useState<string | null>(null)
  useReferralCapture(account)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [pendingTrade, setPendingTrade] = useState<string | null>(null)
  const [slippage, setSlippage] = useState("1")
  const [message, setMessage] = useState("")

  // Extended token universe: curated TOKENS + WolfSwap's Cronos whitelist,
  // fetched once. Curated entries win on address collisions so verified
  // decimals/DEX routing (e.g. TROLL via Obsidian) are never overwritten.
  const [importedTokens, setImportedTokens] = useState<Token[]>([])
  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/tokenlist", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.tokens)) {
          setImportedTokens(data.tokens.map((t: Token) => ({ ...t, imported: true })))
        }
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const allTokens = useMemo(() => {
    const curated = new Set(TOKENS.map((t) => t.address.toLowerCase()))
    const list = [...TOKENS, ...importedTokens.filter((t) => !curated.has(t.address.toLowerCase()))]
    return [...list.filter((t) => isMery(t.address)), ...list.filter((t) => !isMery(t.address))]
  }, [importedTokens])

  const [market, setMarket] = useState<MarketMap>({})
  const [marketLoading, setMarketLoading] = useState(true)
  const [marketError, setMarketError] = useState(false)
  const [marketReload, setMarketReload] = useState(0)
  const croDexPrice = market[getTokenBySymbol("WCRO")?.address.toLowerCase() ?? ""]?.priceUsd ?? null

  useEffect(() => {
    const controller = new AbortController()
    setMarketLoading(true)
    setMarketError(false)
    fetchMarketData(controller.signal)
      .then((data) => setMarket(data))
      .catch((error) => {
        if (error?.name !== "AbortError") setMarketError(true)
      })
      .finally(() => setMarketLoading(false))
    return () => controller.abort()
  }, [marketReload])

  const marketRows = useMemo(() => buildMarketRows(market), [market])
  const refreshMarket = () => setMarketReload((n) => n + 1)

  const [trending, setTrending] = useState<TrendingToken[]>([])
  const [trendingLoading, setTrendingLoading] = useState(true)
  const [trendingError, setTrendingError] = useState(false)
  const [trendingReload, setTrendingReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setTrendingLoading(true)
    setTrendingError(false)
    fetchTrending(controller.signal)
      .then((data) => setTrending(data))
      .catch((error) => {
        if (error?.name !== "AbortError") setTrendingError(true)
      })
      .finally(() => setTrendingLoading(false))
    return () => controller.abort()
  }, [trendingReload])

  const refreshTrending = () => setTrendingReload((n) => n + 1)

  const [chainStats, setChainStats] = useState<ChainStats | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetchChainStats(controller.signal)
      .then((data) => setChainStats(data))
      .catch((error) => {
        if (error?.name !== "AbortError") setChainStats(null)
      })
    return () => controller.abort()
  }, [marketReload])

  const [balances, setBalances] = useState<BalanceMap>({})
  const [balancesLoading, setBalancesLoading] = useState(false)
  const [balancesReload, setBalancesReload] = useState(0)
  const refreshBalances = () => setBalancesReload((n) => n + 1)

  useEffect(() => {
    if (!account) {
      setBalances({})
      return
    }
    const controller = new AbortController()
    setBalancesLoading(true)
    fetchBalances(account, controller.signal)
      .then((data) => setBalances(data))
      .catch((error) => {
        if (error?.name !== "AbortError") setBalances({})
      })
      .finally(() => setBalancesLoading(false))
    return () => controller.abort()
  }, [account, balancesReload])

  // Live token logos sourced from DexScreener market data, keyed by address.
  const logos = useMemo(() => {
    const map: Record<string, string> = {}
    for (const [address, stat] of Object.entries(market)) {
      if (stat.imageUrl) map[address] = stat.imageUrl
    }
    return map
  }, [market])

  const connectWallet = async () => {
    const ethereum = (window as Window & { ethereum?: unknown }).ethereum as { request: (args: { method: string; params?: unknown[] }) => Promise<string[]> } | undefined
    if (!ethereum) { setMessage("Install a compatible wallet to continue."); return }
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" })
      setAccount(accounts[0])
      setMessage("")
    } catch { setMessage("Wallet connection was cancelled.") }
  }

  // One-click trade: size is either a fixed input amount or a % of the wallet's
  // on-chain balance of the input token. Each call takes a fresh WolfSwap quote,
  // so there is never a stale quote to manage.
  const swapNow = async (fromToken: Token, toToken: Token, sizing: { amount: string } | { percent: number }, tag: string) => {
    if (swapping) return
    if (!account) { await connectWallet(); return }
    const ethereum = (window as Window & { ethereum?: unknown }).ethereum
    if (!ethereum) { setMessage("Install a compatible wallet to continue."); return }

    setSwapping(true)
    setPendingTrade(tag)
    try {
      const provider = new BrowserProvider(ethereum as ConstructorParameters<typeof BrowserProvider>[0])
      const signer = await provider.getSigner()
      const slippageBps = Math.round(Number(slippage || "1") * 100)
      const erc20 = ["function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]

      const balanceWei: bigint = fromToken.isNative
        ? await provider.getBalance(account)
        : await new Contract(fromToken.address, erc20, provider).balanceOf(account)
      const amountInWei = "amount" in sizing
        ? parseUnits(sizing.amount, fromToken.decimals)
        : (balanceWei * BigInt(Math.round(sizing.percent * 100))) / BigInt(10000)
      if (amountInWei <= BigInt(0)) throw new Error(`You have no ${fromToken.symbol} to sell.`)
      const gasReserve = fromToken.isNative ? parseUnits(CRO_GAS_RESERVE, 18) : BigInt(0)
      if (amountInWei + gasReserve > balanceWei) {
        throw new Error(fromToken.isNative ? `Not enough CRO. Keep about ${CRO_GAS_RESERVE} CRO for gas.` : `Not enough ${fromToken.symbol}.`)
      }
      const fromAmount = formatUnits(amountInWei, fromToken.decimals)

      // USD value of the trade, priced off the input token (native CRO uses WCRO).
      const priceKey = (fromToken.isNative ? getTokenBySymbol("WCRO")?.address : fromToken.address)?.toLowerCase()
      const inputPrice = priceKey ? market[priceKey]?.priceUsd ?? null : null
      const tradeUsd = inputPrice != null ? Number(fromAmount) * inputPrice : null
      const logTrade = (txHash: string) =>
        recordTrade({
          wallet: account,
          txHash,
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          fromAddress: fromToken.address,
          toAddress: toToken.address,
          amountIn: fromAmount,
          usdValue: tradeUsd,
        })

      if (isWrapPair(fromToken, toToken)) {
        // 1:1 native wrap/unwrap — no router, no approval.
        setMessage(fromToken.isNative ? "Confirm wrap in your wallet…" : "Confirm unwrap in your wallet…")
        const hash = fromToken.isNative
          ? await wrapCRO(fromAmount, signer)
          : await unwrapCRO(fromAmount, signer)
        logTrade(hash)
        await provider.waitForTransaction(hash)
        setMessage(`${fromToken.isNative ? "Wrap" : "Unwrap"} confirmed on Cronos.`)
      } else {
        setMessage(`Finding best price: ${fromToken.symbol} → ${toToken.symbol}…`)
        const quoteRes = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromAddress: getRoutingAddress(fromToken),
            toAddress: getRoutingAddress(toToken),
            fromDecimals: fromToken.decimals,
            toDecimals: toToken.decimals,
            amountIn: fromAmount,
            nativeIn: Boolean(fromToken.isNative),
            nativeOut: Boolean(toToken.isNative),
          }),
        })
        const quote = await quoteRes.json().catch(() => null)
        if (!quoteRes.ok || quote?.source !== "wolfswap" || !quote?.quoteId) {
          throw new Error(`No route for ${fromToken.symbol} → ${toToken.symbol} right now.`)
        }
        const quoteId: string = quote.quoteId
        const expectedOut = Number(quote.amountOut)

        setMessage("Building best route…")
        const res = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteId, to: account, slippageBps }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || "Failed to build swap transaction")

        const wcroAddress = getTokenBySymbol("WCRO")?.address
        if ((fromToken.isNative || toToken.isNative) && !wcroAddress) throw new Error("WCRO not configured")

        const inputIsWcro = !!wcroAddress && fromToken.address.toLowerCase() === wcroAddress.toLowerCase()
        // WolfSwap's router treats WCRO input as native CRO: it must receive the amount
        // as msg.value and wraps internally, otherwise it reverts with "ValueNotEnough".
        const payNative = fromToken.isNative || inputIsWcro

        if (inputIsWcro) {
          setMessage("Step 1: confirm unwrapping WCRO → CRO in your wallet…")
          const unwrapHash = await unwrapCRO(fromAmount, signer)
          await provider.waitForTransaction(unwrapHash)
        } else if (!payNative) {
          const tokenContract = new Contract(fromToken.address, erc20, signer)
          const allowance: bigint = await tokenContract.allowance(account, data.address)
          if (allowance < amountInWei) {
            setMessage("Approve token spending in your wallet…")
            const approveTx = await tokenContract.approve(data.address, amountInWei)
            await approveTx.wait()
          }
        }

        // Snapshot WCRO so we unwrap exactly what this swap produced.
        const wcroContract = toToken.isNative ? new Contract(wcroAddress!, erc20, signer) : null
        const wcroBefore: bigint = wcroContract ? await wcroContract.balanceOf(account) : BigInt(0)

        setMessage("Confirm the swap in your wallet…")
        const tx = await signer.sendTransaction({
          to: data.address,
          data: data.calldata,
          ...(payNative ? { value: amountInWei } : {}),
        })
        logTrade(tx.hash)
        setMessage(`Swap submitted: ${tx.hash.slice(0, 10)}… Waiting for confirmation.`)
        await tx.wait()

        if (wcroContract) {
          const received = (await wcroContract.balanceOf(account)) - wcroBefore
          if (received > BigInt(0)) {
            setMessage("Final step: confirm unwrapping WCRO → CRO in your wallet…")
            const unwrapHash = await unwrapCRO(formatUnits(received, 18), signer)
            await provider.waitForTransaction(unwrapHash)
          }
        }
        const outLabel = Number.isFinite(expectedOut) ? `~${expectedOut.toLocaleString(undefined, { maximumSignificantDigits: 5 })} ` : ""
        setMessage(`Done: ${Number(fromAmount).toLocaleString(undefined, { maximumSignificantDigits: 6 })} ${fromToken.symbol} → ${outLabel}${toToken.symbol}`)
        emitFx({
          kind: fromToken.isNative ? "buy" : toToken.isNative ? "sell" : "swap",
          label: `${Number(fromAmount).toLocaleString(undefined, { maximumSignificantDigits: 5 })} ${fromToken.symbol} → ${outLabel}${toToken.symbol}`,
        })
      }
      refreshBalances()
    } catch (error) {
      const err = error as { reason?: string; shortMessage?: string; message?: string }
      const raw = err?.reason || err?.shortMessage || err?.message || "Swap failed"
      if (/user rejected|denied|action_rejected/i.test(raw)) setMessage("Transaction rejected in wallet.")
      else if (/insufficient/i.test(raw)) setMessage("Insufficient balance or liquidity for this swap.")
      else setMessage(raw.length > 140 ? `${raw.slice(0, 140)}…` : raw)
    } finally {
      setSwapping(false)
      setPendingTrade(null)
    }
  }


  return (
    <LogoContext.Provider value={logos}>
    <main className="arcade-lights relative min-h-screen overflow-x-hidden text-white">
      <header className="relative z-20 border-b border-white/10 bg-[#0b0816]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1320px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-9">
            <button className="group flex items-center gap-3" onClick={() => setActiveTab("Overview")} aria-label="Go to overview">
              <img src="/images/mcro-logo.png" alt="" width={44} height={44} className="h-11 w-11 animate-logo-wobble [image-rendering:pixelated]" />
              <div className="text-left"><div className="font-display text-lg font-bold tracking-tight text-white">MCRO<span className="text-[#29e6ff]">.FUN</span></div><div className="text-xs text-slate-400">Cronos Arcade</div></div>
            </button>
            <nav className="hidden items-center gap-1 md:flex">{tabs.map(tab => <button key={tab} onClick={() => setActiveTab(tab)} className={`rounded-md px-3 py-2 text-sm font-medium transition ${activeTab === tab ? "bg-white/[0.07] text-white" : "text-slate-400 hover:text-white"}`}>{tab}</button>)}</nav>
          </div>
          <div className="flex items-center gap-3"><NetworkSwitch onUnavailable={setMessage} /><button onClick={connectWallet} className="arcade-btn rounded-md bg-[#29e6ff] px-4 py-2 font-display text-sm font-bold text-[#0b0816] hover:bg-[#8ef3ff]">{account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Connect wallet"}</button><button className="rounded-md p-2 text-slate-300 md:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu"><Menu size={20} /></button></div>
        </div>
        {mobileOpen && <nav aria-label="Mobile navigation" className="grid grid-cols-3 gap-2 border-t border-white/10 px-5 py-3 md:hidden">{tabs.map(tab => <button key={tab} onClick={() => { setActiveTab(tab); setMobileOpen(false) }} aria-current={activeTab === tab ? "page" : undefined} className={`rounded-md px-2 py-3 text-center text-sm font-medium transition ${activeTab === tab ? "bg-white/[0.08] text-white" : "bg-white/[0.03] text-slate-400"}`}>{tab}</button>)}</nav>}
      </header>

      <Ticker rows={marketRows} />

      <div className="relative z-10 mx-auto max-w-[1320px] px-5 py-8 lg:px-8 lg:py-12">
        {activeTab === "Swap" ? <SwapPanel tokens={allTokens} account={account} swapping={swapping} balances={balances} balancesLoading={balancesLoading} slippage={slippage} setSlippage={setSlippage} onSwap={(from, to, sizing) => swapNow(from, to, sizing, `swap:${to.address.toLowerCase()}`)} onConnect={connectWallet} /> : activeTab === "Pro" ? <ProTerminal croDexPrice={croDexPrice} onSwap={() => { setActiveTab("Swap"); window.scrollTo({ top: 0 }) }} /> : activeTab === "Predict" ? <PredictHub account={account} onConnect={connectWallet} /> : activeTab === "Markets" ? <MarketsPanel account={account} /> : activeTab === "NFTs" ? <NftPanel account={account} onConnect={connectWallet} /> : activeTab === "Game" ? <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"><div className="min-w-0"><GamePanel account={account} onConnect={connectWallet} /></div><LiveChat room="game" title="Arena chat" account={account} onConnect={connectWallet} /></div> : activeTab === "Portfolio" ? <PortfolioPanel account={account} onConnect={connectWallet} market={market} balances={balances} balancesLoading={balancesLoading} onRefresh={refreshBalances} /> : activeTab === "Referral" ? <ReferralPanel account={account} onConnect={connectWallet} /> : <>
          <section className="mb-12 flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
            <div>
              <p className="mb-3 text-sm text-slate-400">Cronos market today</p>
              <h1 className="max-w-3xl font-display text-3xl font-bold leading-tight tracking-tight text-balance sm:text-5xl">What&apos;s moving on Cronos</h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-400 text-pretty">Live prices and volume from Cronos DEXs. Pick a token and swap at the best route, straight from your wallet.</p>
            </div>
            <button onClick={() => setActiveTab("Swap")} className="arcade-btn flex w-fit items-center gap-2 rounded-md bg-[#29e6ff] px-5 py-3 font-display text-base font-bold text-[#0b0816] hover:bg-[#8ef3ff]">Press start <Zap size={16} /></button>
          </section>

          <section className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">{[{ icon: BarChart3, label: "24h volume", value: formatUsd(chainStats?.volume24h ?? null), sub: "Cronos DEXs", color: "#29e6ff" }, { icon: CircleDollarSign, label: "Total liquidity", value: formatUsd(chainStats?.liquidityUsd ?? null), sub: "Tracked pairs", color: "#ff3d7f" }, { icon: Fuel, label: "Avg. gas fee", value: formatGasFee(chainStats?.gasFeeUsd ?? null), sub: chainStats?.gasPriceGwei != null ? `${chainStats.gasPriceGwei.toFixed(0)} gwei` : "On-chain", color: "#3dff9a" }, { icon: Wallet, label: "Active wallets", value: formatCount(chainStats?.activeAddresses ?? null), sub: chainStats ? `last ${chainStats.activeSampleBlocks} blocks` : "On-chain", color: "#a39cc8" }].map(({ icon: Icon, label, value, sub, color }) => <div key={label} className="min-w-0 rounded-lg border border-white/10 bg-[#171230]/70 p-4 transition hover:border-[#29e6ff]/40 sm:p-5"><div className="flex items-center justify-between gap-2 font-display text-xs tracking-normal text-slate-400"><span className="truncate">{label}</span><Icon size={16} className="shrink-0" style={{ color }} /></div><div className="mt-3 flex flex-col gap-1 sm:mt-4 sm:flex-row sm:items-end sm:justify-between sm:gap-2"><strong className="truncate font-display text-xl font-bold sm:text-2xl">{chainStats ? value : "…"}</strong><span className="truncate font-display text-[11px] font-bold tracking-normal text-slate-400 sm:text-xs">{sub}</span></div></div>)}</section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <div className="min-w-0 rounded-lg border border-[#29e6ff]/20 bg-[#171230]/70 p-4 sm:p-6">
              <div className="mb-5 flex items-center justify-between"><div><h2 className="flex items-center gap-2 font-display text-sm font-bold tracking-normal text-[#29e6ff]"><TrendingUp size={16} />24h trending</h2><p className="mt-1 text-xs text-slate-400">{trendingError ? "Trending feed unavailable — retry" : trendingLoading ? "Scanning Cronos volume…" : "Top 20 by 24h volume · DexScreener"}</p></div><button onClick={refreshTrending} className="rounded-md border border-white/10 p-2 text-slate-300 hover:text-[#29e6ff]" aria-label="Refresh trending"><RefreshCw size={15} className={trendingLoading ? "animate-spin" : ""} /></button></div>
              {trendingLoading && trending.length === 0 ? (
                <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-md bg-white/[0.04]" />)}</div>
              ) : trending.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center"><TrendingUp size={26} className="text-slate-400" /><p className="font-display text-xs font-bold tracking-normal text-slate-300">No trending data</p><p className="text-xs text-slate-400">DexScreener didn&apos;t return Cronos volume. Try refreshing.</p></div>
              ) : (
                <div className="max-h-[560px] overflow-auto"><table className="w-full text-left text-sm sm:min-w-[590px]"><thead className="sticky top-0 z-10 bg-[#171230] font-display text-xs tracking-normal text-slate-400"><tr className="border-b border-white/10"><th className="pb-3 font-bold">Asset</th><th className="pb-3 text-right font-bold sm:text-left">Price</th><th className="pb-3 pl-3 text-right font-bold sm:text-left">24h</th><th className="hidden pb-3 font-bold sm:table-cell">Volume</th><th className="hidden pb-3 font-bold sm:table-cell">Liquidity</th></tr></thead><tbody>{trending.map((row, i) => { const token: Token = { address: row.address, symbol: row.symbol, name: row.name, decimals: 18, color: "#29e6ff", logoURI: row.imageUrl ?? undefined }; const positive = (row.change24h ?? 0) >= 0; const rankColor = i === 0 ? "text-[#ffd23f]" : i === 1 ? "text-[#c0c7d1]" : i === 2 ? "text-[#e08a4b]" : "text-[#ff3d7f]/60"; return <tr key={row.address} className="border-b border-white/[0.06] last:border-0 transition hover:bg-white/[0.03]"><td className="py-3 sm:py-4"><div className="flex min-w-0 items-center gap-2 sm:gap-3"><span className={`font-display text-xs font-bold ${rankColor}`}>{String(i + 1).padStart(2, "0")}</span><TokenIcon token={token} size="sm" /><div className="min-w-0"><a href={`https://dexscreener.com/cronos/${row.address}`} target="_blank" rel="noopener noreferrer" className="block max-w-[96px] truncate font-display text-xs font-bold hover:text-[#29e6ff] sm:max-w-none">{row.symbol}</a><div className="max-w-[96px] truncate text-xs text-slate-400 sm:max-w-[140px]">{row.name}</div></div></div></td><td className="text-right font-display text-xs font-bold text-[#29e6ff] sm:text-left sm:text-sm">{formatPrice(row.priceUsd)}</td><td className={`pl-3 text-right font-display text-xs font-bold sm:text-left sm:text-sm ${positive ? "text-[#3dff9a]" : "text-[#ff3d7f]"}`}>{formatChange(row.change24h)}</td><td className="hidden text-slate-300 sm:table-cell">{formatUsd(row.volume24h)}</td><td className="hidden text-slate-300 sm:table-cell">{formatUsd(row.liquidityUsd)}</td></tr> })}</tbody></table></div>
              )}
            </div>
            <div className="relative min-w-0 overflow-hidden rounded-lg border border-white/10 bg-[#171230] p-5 shadow-sm sm:p-6">
              <div className="pointer-events-none absolute inset-0 opacity-[0.12]" />
              <div className="relative mb-10 flex items-center justify-between"><div><div className="mb-2 flex items-center gap-2 font-display text-xs font-bold tracking-normal text-[#3dff9a]"><ShieldCheck size={15} />Non-custodial</div><h2 className="font-display text-2xl font-bold">Swap with confidence.</h2></div><ArrowDownUp className="text-[#ff3d7f]" size={30} /></div>
              <p className="relative max-w-sm text-sm leading-6 text-slate-300">Your keys stay in your wallet. Every route is quoted on-chain and protected by your slippage settings.</p>
              <button onClick={() => setActiveTab("Swap")} className="relative mt-8 flex items-center gap-2 font-display text-sm font-bold tracking-normal text-white hover:text-[#29e6ff]">Open swap <ArrowUpRight size={16} /></button>
            </div>
          </section>
        </>}
      </div>

      <footer className="relative z-10 border-t border-[#29e6ff]/15 py-6"><div className="mx-auto flex max-w-[1320px] flex-col justify-between gap-3 px-5 font-display text-xs tracking-normal text-slate-400 sm:flex-row lg:px-8"><span>MCRO.FUN · Cronos Mainnet</span><span>Powered by Cronos Network and Crypto.com data</span><span>Best-route swaps · Non-custodial</span></div></footer>
      {message && <div role="status" className="fixed bottom-5 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-md border border-[#29e6ff]/40 bg-[#171230] px-4 py-3 text-sm shadow-2xl shadow-sm"><span className="min-w-0 break-words">{message}</span><button onClick={() => setMessage("")} aria-label="Dismiss message" className="shrink-0 p-1"><X size={15} /></button></div>}
      <McroFx />
    </main>
    </LogoContext.Provider>
  )
}

const CRO_GAS_RESERVE = "0.5"

interface SwapPanelProps {
  tokens: Token[]
  account: string | null
  swapping: boolean
  balances: BalanceMap
  balancesLoading: boolean
  slippage: string
  setSlippage: (value: string) => void
  onSwap: (from: Token, to: Token, sizing: SwapSizing) => void
  onConnect: () => void
}

function SwapPanel({ tokens, account, swapping, balances, balancesLoading, slippage, setSlippage, onSwap, onConnect }: SwapPanelProps) {
  const cro = tokens.find((t) => t.isNative)
  const [token, setToken] = useState<Token | null>(() => tokens.find((t) => isMery(t.address)) ?? tokens.find((t) => !t.isNative) ?? null)
  const [mode, setMode] = useState<SwapMode>("buy")
  const pick = (t: Token, m: SwapMode) => {
    setToken(t)
    setMode(m)
    if (window.matchMedia("(max-width: 1023px)").matches) document.getElementById("swap-box")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  return <section className="mx-auto grid max-w-7xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
    <div className="min-w-0 lg:col-start-1 lg:row-start-1">
      <div className="mb-6 text-center lg:text-left">
        <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-[#ff3d7f]/30 bg-[#ff3d7f]/10 px-3 py-1 font-display text-xs font-bold tracking-normal text-[#ff3d7f]"><ArrowDownUp size={13} /> MCRO.FUN smart routing</div>
        <h1 className="text-balance font-display text-4xl font-bold tracking-tight">Swap in <span className="text-[#29e6ff]">seconds</span></h1>
        <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-6 text-slate-300 lg:mx-0">Pick a token, enter an amount, check what you get, then confirm in your wallet. Nothing is sent until you approve it.</p>
      </div>
    </div>
    <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
      {cro && <SwapBox tokens={tokens} cro={cro} token={token} mode={mode} onTokenChange={setToken} onModeChange={setMode} account={account} balances={balances} balancesLoading={balancesLoading} swapping={swapping} slippage={slippage} setSlippage={setSlippage} onSwap={onSwap} onConnect={onConnect} />}
      <LiveChat room="swap" title="Traders chat" account={account} onConnect={onConnect} />
    </div>
    <div className="min-w-0 lg:col-start-1 lg:row-start-2">
      <DegenArcade tokens={tokens} account={account} swapping={swapping} selectedAddress={token?.address.toLowerCase() ?? null} onPick={pick} onConnect={onConnect} />
    </div>
  </section>
}

function MarketsPanel({ account }: { account: string | null }) {
  const [data, setData] = useState<{ leaders: LeaderRow[]; totals: LeaderboardTotals } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reload, setReload] = useState(0)
  const me = account?.toLowerCase() ?? null

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    fetchLeaderboard(controller.signal)
      .then((d) => setData(d))
      .catch((e) => { if (e?.name !== "AbortError") setError(true) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [reload])

  const leaders = data?.leaders ?? []
  const totals = data?.totals
  const rankColor = (rank: number) => (rank === 1 ? "#3dff9a" : rank === 2 ? "#29e6ff" : rank === 3 ? "#ff3d7f" : "#64748b")

  return <section>
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <Eyebrow color="cyan">MCRO.FUN traders</Eyebrow>
        <h1 className="font-display text-4xl font-bold tracking-tight">Leader<span className="text-[#29e6ff]">board</span></h1>
        <p className="mt-3 text-sm text-slate-300">{error ? "Leaderboard unavailable — try refreshing." : "Unique wallets ranked by volume traded on MCRO.FUN."}</p>
      </div>
      <button className="flex w-fit items-center gap-2 rounded-md border border-white/10 px-4 py-2.5 font-display text-xs font-bold tracking-normal text-slate-300 hover:border-[#29e6ff]/50 hover:text-white disabled:opacity-60" disabled={loading} onClick={() => setReload(n => n + 1)}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh</button>
    </div>

    <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">
      {[
        { label: "Total volume", value: totals ? formatVolume(totals.totalVolume) : "—", accent: "#3dff9a", glow: "neon-lime" },
        { label: "Unique traders", value: totals ? totals.totalWallets.toLocaleString() : "—", accent: "#29e6ff", glow: "neon-cyan" },
        { label: "Total trades", value: totals ? totals.totalTrades.toLocaleString() : "—", accent: "#ff3d7f", glow: "neon-pink" },
      ].map((s) => <div key={s.label} className="min-w-0 rounded-lg border border-white/10 bg-[#171230]/70 p-3 sm:p-5"><div className="font-display text-[11px] leading-tight tracking-normal text-slate-400 sm:text-xs">{s.label}</div><div className={`mt-2 truncate font-display text-lg font-bold tabular-nums sm:text-3xl ${s.glow}`} style={{ color: s.accent }}>{loading && !data ? "…" : s.value}</div></div>)}
    </div>

    <div className="overflow-x-auto rounded-lg border border-[#29e6ff]/20 bg-[#171230]/70 p-4 sm:p-6">
      {loading && !data ? <div className="space-y-3">{[0, 1, 2, 3, 4].map(i => <div key={i} className="flex items-center gap-3"><div className="h-8 w-8 animate-pulse rounded bg-white/10" /><div className="h-3 w-40 animate-pulse rounded bg-white/10" /><div className="ml-auto h-3 w-20 animate-pulse rounded bg-white/5" /></div>)}</div>
        : error ? <div className="p-10 text-center text-sm text-slate-400">Couldn&apos;t load the leaderboard. Try refreshing.</div>
        : leaders.length === 0 ? <div className="p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-[#29e6ff]/10 text-[#29e6ff] shadow-sm"><Trophy size={26} /></div><h2 className="mt-5 font-display text-xl font-bold">No trades yet</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-300">Be the first to make the board — swap on MCRO.FUN and your wallet shows up here.</p></div>
        : <table className="w-full text-left text-sm sm:min-w-[680px]"><thead className="border-b border-white/10 font-display text-xs tracking-normal text-slate-400"><tr><th className="pb-3 font-bold">Rank</th><th className="pb-3 font-bold">Trader</th><th className="pb-3 font-bold text-right">Volume</th><th className="pb-3 font-bold text-right">Trades</th><th className="hidden pb-3 font-bold text-right sm:table-cell">Last trade</th></tr></thead><tbody>{leaders.map((row) => {
          const mine = me != null && row.wallet.toLowerCase() === me
          return <tr key={row.wallet} className={`border-b border-white/[0.06] last:border-0 transition hover:bg-white/[0.03] ${mine ? "bg-[#3dff9a]/[0.06]" : ""}`}>
            <td className="py-4"><span className="font-display text-lg font-bold tabular-nums" style={{ color: rankColor(row.rank) }}>{String(row.rank).padStart(2, "0")}</span></td>
            <td className="py-4"><div className="flex items-center gap-2 sm:gap-3"><div className="hidden h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-[#a39cc8]/40 to-[#110d22] font-display text-xs font-bold text-white sm:flex">{row.wallet.slice(2, 4).toUpperCase()}</div><div><a href={`${ACTIVE_CHAIN.explorer}/address/${row.wallet}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-mono text-xs text-[#29e6ff] hover:text-[#8ef3ff]">{shortWallet(row.wallet)} <ArrowUpRight size={12} /></a>{mine && <span className="font-display text-[11px] tracking-normal text-[#3dff9a]">You</span>}</div></div></td>
            <td className="py-4 text-right font-display font-bold text-[#3dff9a]">{formatVolume(row.volume)}</td>
            <td className="py-4 text-right font-display font-bold text-slate-300 tabular-nums">{row.trades}</td>
            <td className="hidden py-4 text-right font-mono text-xs text-slate-400 sm:table-cell">{timeAgo(row.lastTraded)}</td>
          </tr>
        })}</tbody></table>}
    </div>
  </section>
}

function PortfolioPanel({ account, onConnect, market, balances, balancesLoading, onRefresh }: { account: string | null; onConnect: () => void; market: MarketMap; balances: BalanceMap; balancesLoading: boolean; onRefresh: () => void }) {
  // Native CRO tracks WCRO's price; every other token is priced by its own address.
  const wcro = getTokenBySymbol("WCRO")
  const priceOf = (token: Token): number | null => market[token.address.toLowerCase()]?.priceUsd ?? null
  const nativePrice = wcro ? market[wcro.address.toLowerCase()]?.priceUsd ?? null : null
  const nativeAmount = Number(balances.native ?? 0)

  const holdings = [
    { key: "native", token: { address: "native", symbol: "CRO", name: "Cronos", decimals: 18, color: "#1199FA" } as Token, amount: nativeAmount, price: nativePrice, native: true },
    ...TOKENS.filter((token) => !token.isNative).map((token) => {
      const amount = Number(balances[token.address.toLowerCase()] ?? 0)
      return { key: token.address, token, amount, price: priceOf(token), native: false }
    }),
  ]
    .map((h) => ({ ...h, value: h.price != null ? h.amount * h.price : null }))
    .filter((h) => h.amount > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

  const totalValue = holdings.reduce((sum, h) => sum + (h.value ?? 0), 0)
  const loadingInitial = balancesLoading && Object.keys(balances).length === 0

  return <section className="mx-auto max-w-4xl"><div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Eyebrow color="lime">Your assets</Eyebrow><h1 className="font-display text-4xl font-bold tracking-tight">Player <span className="text-[#3dff9a]">stats</span></h1><p className="mt-3 text-sm text-slate-300">Live wallet balances across Cronos, priced via DexScreener.</p></div>{account && <button className="flex w-fit items-center gap-2 rounded-md border border-white/10 px-4 py-2.5 font-display text-xs font-bold tracking-normal text-slate-300 hover:border-[#3dff9a]/50 hover:text-white disabled:opacity-60" disabled={balancesLoading} onClick={onRefresh}><RefreshCw size={15} className={balancesLoading ? "animate-spin" : ""} /> Refresh</button>}</div>
    {account ? <>
      <div className="relative mb-6 overflow-hidden rounded-lg border border-white/10 bg-[#171230] p-6 shadow-sm"><div className="pointer-events-none absolute inset-0 opacity-[0.12]" /><div className="relative font-display text-xs tracking-normal text-slate-400">Connected wallet</div><div className="relative mt-3 break-all font-mono text-sm text-[#29e6ff]">{account}</div><div className="relative mt-8 font-display text-xs tracking-normal text-slate-400">Total score (est. value)</div><div className="relative mt-1 font-display text-4xl font-bold text-[#3dff9a]">{loadingInitial ? "…" : formatUsd(totalValue)}</div><div className="relative mt-2 font-display text-xs tracking-normal text-slate-400">{holdings.length} asset{holdings.length === 1 ? "" : "s"} held</div></div>
      <div className="overflow-hidden rounded-lg border border-white/10 bg-[#171230]/70">
        <div className="flex items-center justify-between border-b border-white/10 p-5"><h2 className="font-display text-sm font-bold tracking-normal">Token balances</h2><span className="font-display text-xs tracking-normal text-slate-400">Cronos mainnet</span></div>
        {loadingInitial ? <div className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3"><div className="h-9 w-9 animate-pulse rounded-full bg-white/10" /><div className="flex-1 space-y-2"><div className="h-3 w-20 animate-pulse rounded bg-white/10" /><div className="h-2 w-32 animate-pulse rounded bg-white/5" /></div></div>)}</div>
          : holdings.length === 0 ? <div className="p-10 text-center text-sm text-slate-400">No token balances found in this wallet on Cronos.</div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b border-white/10 font-display text-xs tracking-normal text-slate-400"><tr><th className="p-4 font-bold">Asset</th><th className="p-4 font-bold text-right">Balance</th><th className="p-4 font-bold text-right">Price</th><th className="p-4 font-bold text-right">Value</th></tr></thead><tbody>{holdings.map((h) => <tr key={h.key} className="border-b border-white/[0.06] last:border-0 transition hover:bg-white/[0.03]"><td className="p-4"><div className="flex items-center gap-3"><TokenIcon token={h.token} size="sm" /><div><div className="flex items-center gap-1.5 font-display text-xs font-bold">{h.token.symbol}{h.native && <span className="rounded border border-[#1199FA]/40 px-1 py-0.5 font-display text-[11px] tracking-wide text-[#8ef3ff]">Native</span>}</div><div className="text-xs text-slate-400">{h.token.name}</div></div></div></td><td className="p-4 text-right font-display font-bold">{formatBalance(h.amount)}</td><td className="p-4 text-right font-mono text-xs text-slate-300">{h.price != null ? formatPrice(h.price) : "—"}</td><td className="p-4 text-right font-display font-bold text-[#3dff9a]">{h.value != null ? formatUsd(h.value) : "—"}</td></tr>)}</tbody></table></div>}
      </div>
    </> : <div className="rounded-lg border border-dashed border-[#29e6ff]/25 bg-[#171230]/50 p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-[#29e6ff]/10 text-[#29e6ff] shadow-sm"><Wallet size={26} /></div><h2 className="mt-5 font-display text-xl font-bold">Connect your wallet</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-300">Connect a Cronos wallet to view your balances and portfolio value.</p><button onClick={onConnect} className="mt-6 rounded-md arcade-btn bg-[#29e6ff] px-5 py-3 font-display text-xs font-bold tracking-normal text-[#0b0816] hover:bg-[#8ef3ff] shadow-sm">Connect wallet</button></div>}
  </section>
}

function NftImage({ src, alt, id }: { src?: string; alt: string; id: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className="relative flex h-full w-full items-center justify-center" style={{ background: "radial-gradient(circle at 50% 40%, #a855f733, transparent 70%)" }}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.15]" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-lg font-display text-lg font-bold text-white" style={{ background: "linear-gradient(135deg, #a39cc8, #110d22)", boxShadow: "0 0 24px #a855f755" }}>#{id}</div>
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src || "/placeholder.svg"} alt={alt} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
}

function NftPanel({ account, onConnect }: { account: string | null; onConnect: () => void }) {
  const [view, setView] = useState<"market" | "wallet">("market")
  const [collection, setCollection] = useState<Collection | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [listingsMeta, setListingsMeta] = useState({ totalCount: 0, totalPages: 1 })
  const [page, setPage] = useState(1)
  const [marketLoading, setMarketLoading] = useState(true)
  const [marketError, setMarketError] = useState(false)
  const [walletNfts, setWalletNfts] = useState<WalletNft[]>([])
  const [walletLoading, setWalletLoading] = useState(false)
  const [walletError, setWalletError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null)

  const notify = (kind: "ok" | "err" | "info", text: string) => {
    setToast({ kind, text })
    if (kind !== "info") window.setTimeout(() => setToast(null), 6000)
  }

  useEffect(() => {
    let active = true
    fetchCollection().then(c => { if (active) setCollection(c) }).catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    setMarketLoading(true)
    setMarketError(false)
    fetchListings(page)
      .then(r => { if (!active) return; setListings(r.listings); setListingsMeta({ totalCount: r.totalCount, totalPages: r.totalPages }) })
      .catch(() => { if (active) setMarketError(true) })
      .finally(() => { if (active) setMarketLoading(false) })
    return () => { active = false }
  }, [page])

  const loadWallet = () => {
    if (!account) return
    setWalletLoading(true)
    setWalletError(false)
    fetchWalletNfts(account)
      .then(setWalletNfts)
      .catch(() => setWalletError(true))
      .finally(() => setWalletLoading(false))
  }

  useEffect(() => {
    if (view === "wallet" && account) loadWallet()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, account])

  const onBuy = async (l: Listing) => {
    if (!account) { onConnect(); return }
    if (l.currency !== NATIVE_CURRENCY) { notify("err", "This listing is priced in a token — buy it on Ebisu's Bay."); return }
    setBusyId(l.listingId)
    notify("info", "Validating listing and preparing your purchase…")
    try {
      const hash = await buyListing(l.listingId, account)
      notify("ok", `Purchased ${l.nft?.name || `#${l.nftId}`}. Tx ${hash.slice(0, 10)}…`)
      setListings(prev => prev.filter(x => x.listingId !== l.listingId))
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Purchase failed"
      notify("err", /rejected|denied/i.test(msg) ? "Transaction rejected in wallet." : msg)
    } finally {
      setBusyId(null)
    }
  }

  const onList = async (nft: WalletNft) => {
    if (!account) { onConnect(); return }
    setBusyId(nft.nftId)
    try {
      notify("info", "Checking marketplace approval in your wallet…")
      await ensureListingApproval(account)
      notify("ok", "MERY approved for trading. Opening the listing form on Ebisu's Bay…")
      window.open(listingUrl(nft.nftId), "_blank", "noopener,noreferrer")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Approval failed"
      notify("err", /rejected|denied/i.test(msg) ? "Approval rejected in wallet." : msg)
    } finally {
      setBusyId(null)
    }
  }

  const stats = collection?.stats?.total
  const headerStats = [
    { label: "Floor", value: `${croFormat(stats?.floorPrice)} CRO` },
    { label: "30d volume", value: `${croFormat(stats?.volume30d)} CRO` },
    { label: "Supply", value: collection?.totalSupply ? croFormat(collection.totalSupply) : "—" },
    { label: "Holders", value: collection?.holders ? croFormat(collection.holders) : "—" },
  ]
  const avatar = (collection?.metadata?.avatar as string) || undefined

  return <section>
    {toast && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 px-4"><div className={`flex items-center gap-2 rounded-md border px-4 py-3 font-display text-xs shadow-2xl backdrop-blur-md ${toast.kind === "ok" ? "border-[#3dff9a]/40 bg-[#3dff9a]/10 text-[#3dff9a]" : toast.kind === "err" ? "border-[#ff3d7f]/40 bg-[#ff3d7f]/10 text-[#ff85ad]" : "border-[#29e6ff]/40 bg-[#29e6ff]/10 text-[#29e6ff]"}`}>{toast.kind === "info" ? <Loader2 size={14} className="animate-spin" /> : toast.kind === "ok" ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}<span className="max-w-[80vw] break-words">{toast.text}</span><button onClick={() => setToast(null)} className="ml-1 text-current/70 hover:text-current" aria-label="Dismiss"><X size={14} /></button></div></div>}

    <div className="mb-8"><Eyebrow color="lime">NFT collection</Eyebrow><h1 className="font-display text-4xl font-bold tracking-tight">Mistery <span className="text-[#a39cc8]">on Cro</span></h1><p className="mt-3 text-sm text-slate-300">Buy from the live Ebisu&apos;s Bay marketplace, or list and sell the MERY NFTs in your wallet.</p></div>

    {/* Collection header */}
    <div className="relative mb-6 overflow-hidden arcade-panel rounded-xl border border-white/15 bg-[#171230]/70 p-5">
      <div className="pointer-events-none absolute inset-0 opacity-[0.08]" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#110d22]"><NftImage src={avatar} alt="Mistery on Cro avatar" id="MERY" /></div>
          <div>
            <div className="flex items-center gap-2"><h2 className="font-display text-lg font-bold">{collection?.name || "Mistery on Cro"}</h2>{collection?.verification?.verified && <span className="flex items-center gap-1 rounded-md bg-[#29e6ff]/15 px-2 py-0.5 font-display text-[11px] font-bold tracking-normal text-[#29e6ff]"><ShieldCheck size={11} />Verified</span>}</div>
            <a href={`https://app.ebisusbay.com/collection/cronos/${MERY_SLUG}`} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 font-display text-xs tracking-normal text-slate-400 hover:text-[#29e6ff]">View on Ebisu&apos;s Bay <ExternalLink size={11} /></a>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">{headerStats.map(s => <div key={s.label}><div className="font-display text-xs tracking-normal text-slate-400">{s.label}</div><div className="mt-0.5 font-display text-base font-bold text-[#3dff9a]">{s.value}</div></div>)}</div>
      </div>
    </div>

    {/* View toggle */}
    <div className="mb-6 flex items-center gap-2">
      <button onClick={() => setView("market")} className={`rounded-md px-4 py-2 font-display text-xs font-bold tracking-normal transition ${view === "market" ? "bg-[#29e6ff] text-[#0b0816]" : "border border-white/10 bg-white/[0.03] text-slate-300 hover:text-white"}`}>Marketplace{listingsMeta.totalCount ? ` (${croFormat(listingsMeta.totalCount)})` : ""}</button>
      <button onClick={() => setView("wallet")} className={`rounded-md px-4 py-2 font-display text-xs font-bold tracking-normal transition ${view === "wallet" ? "bg-[#29e6ff] text-[#0b0816]" : "border border-white/10 bg-white/[0.03] text-slate-300 hover:text-white"}`}>My MERY{account && walletNfts.length ? ` (${walletNfts.length})` : ""}</button>
    </div>

    {view === "market" ? (
      marketLoading ? <NftGridSkeleton /> :
      marketError ? <EmptyState icon={AlertTriangle} title="Marketplace unavailable" text="Ebisu's Bay didn't respond. Try again in a moment." accent="#ff3d7f" /> :
      listings.length === 0 ? <EmptyState icon={ImageIcon} title="No active listings" text="There are no MERY NFTs listed for sale right now." accent="#a39cc8" /> :
      <>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">{listings.map(l => {
          const isNative = l.currency === NATIVE_CURRENCY
          const busy = busyId === l.listingId
          return <div key={l.listingId} className="group min-w-0 overflow-hidden rounded-lg border border-white/10 bg-[#171230]/70 transition hover:border-[#a39cc8]/40">
            <div className="relative aspect-square overflow-hidden sm:aspect-auto sm:h-44"><NftImage src={l.nft?.image as string} alt={l.nft?.name || `MERY #${l.nftId}`} id={l.nftId} />{typeof l.nft?.rank === "number" && <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 font-display text-[11px] font-bold tracking-normal text-[#3dff9a] backdrop-blur-sm sm:left-3 sm:top-3">Rank {l.nft.rank}</span>}</div>
            <div className="p-3 sm:p-4">
              <div className="truncate font-display text-sm font-bold">{l.nft?.name || `MERY #${l.nftId}`}</div>
              <div className="mt-1 font-display text-xs tracking-normal text-slate-400">Price</div>
              <div className="mt-2 flex flex-col gap-2 sm:mt-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="truncate font-display text-base font-bold text-[#3dff9a] sm:text-lg">{croFormat(l.price)} {isNative ? "CRO" : "TOK"}</span>
                <button onClick={() => onBuy(l)} disabled={busy} className="flex shrink-0 items-center justify-center gap-1.5 rounded-md border py-2 sm:py-1.5 border-white/10 px-3 py-1.5 font-display text-xs font-bold tracking-normal text-white transition hover:border-[#3dff9a]/40 hover:bg-[#3dff9a] hover:text-[#0b0816] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-white">{busy ? <Loader2 size={13} className="animate-spin" /> : <ShoppingCart size={13} />}{busy ? "Buying" : account ? "Buy now" : "Connect"}</button>
              </div>
            </div>
          </div>
        })}</div>
        {listingsMeta.totalPages > 1 && <div className="mt-6 flex items-center justify-center gap-3"><button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-md border border-white/10 px-4 py-2 font-display text-xs font-bold tracking-normal text-slate-300 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-40">Prev</button><span className="font-display text-xs tracking-normal text-slate-400">Page {page} / {listingsMeta.totalPages}</span><button onClick={() => setPage(p => Math.min(listingsMeta.totalPages, p + 1))} disabled={page >= listingsMeta.totalPages} className="rounded-md border border-white/10 px-4 py-2 font-display text-xs font-bold tracking-normal text-slate-300 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-40">Next</button></div>}
      </>
    ) : (
      !account ? <EmptyState icon={Wallet} title="Connect your wallet" text="Connect a Cronos wallet to see the MERY NFTs you hold and list them for sale." accent="#29e6ff" action={{ label: "Connect wallet", onClick: onConnect }} /> :
      walletLoading ? <NftGridSkeleton /> :
      walletError ? <EmptyState icon={AlertTriangle} title="Couldn't load your NFTs" text="Ebisu's Bay didn't respond. Try again in a moment." accent="#ff3d7f" action={{ label: "Retry", onClick: loadWallet }} /> :
      walletNfts.length === 0 ? <EmptyState icon={ImageIcon} title="No MERY in this wallet" text="You don't hold any Mistery on Cro NFTs yet. Buy one from the marketplace tab." accent="#a39cc8" /> :
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">{walletNfts.map(nft => {
        const listed = nft.market && Object.keys(nft.market).length > 0
        const offer = nft.offer && Object.keys(nft.offer).length > 0 ? nft.offer as { price?: string } : null
        const busy = busyId === nft.nftId
        return <div key={nft.nftId} className="group min-w-0 overflow-hidden rounded-lg border border-white/10 bg-[#171230]/70 transition hover:border-[#29e6ff]/40">
          <div className="relative aspect-square overflow-hidden sm:aspect-auto sm:h-44"><NftImage src={nft.image} alt={nft.name || `MERY #${nft.nftId}`} id={nft.nftId} />{typeof nft.rank === "number" && <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 font-display text-[11px] font-bold tracking-normal text-[#3dff9a] backdrop-blur-sm">Rank {nft.rank}</span>}{listed && <span className="absolute right-3 top-3 rounded-md bg-[#3dff9a]/20 px-2 py-1 font-display text-[11px] font-bold tracking-normal text-[#3dff9a] backdrop-blur-sm">Listed</span>}</div>
          <div className="p-3 sm:p-4">
            <div className="truncate font-display text-sm font-bold">{nft.name || `MERY #${nft.nftId}`}</div>
            {offer?.price ? <div className="mt-1 truncate font-display text-xs tracking-normal text-[#29e6ff]">Best offer {croFormat(offer.price)} CRO</div> : <div className="mt-1 font-display text-xs tracking-normal text-slate-400">In your wallet</div>}
            <div className="mt-3 flex items-center gap-2">
              <button onClick={() => onList(nft)} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[#29e6ff] px-3 py-2 font-display text-xs font-bold tracking-normal text-[#0b0816] transition hover:bg-[#8ef3ff] disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 size={13} className="animate-spin" /> : <Tag size={13} />}{busy ? "Approving" : listed ? "Manage" : "List / Sell"}</button>
              <a href={listingUrl(nft.nftId)} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center justify-center rounded-md border border-white/10 px-3 py-2 text-slate-300 transition hover:border-white/25 hover:text-white" aria-label="View on Ebisu's Bay"><ExternalLink size={14} /></a>
            </div>
          </div>
        </div>
      })}</div>
    )}
  </section>
}

function NftGridSkeleton() {
  return <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="overflow-hidden rounded-lg border border-white/10 bg-[#171230]/70"><div className="aspect-square animate-pulse bg-white/[0.04] sm:aspect-auto sm:h-44" /><div className="space-y-3 p-4"><div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" /><div className="h-3 w-1/3 animate-pulse rounded bg-white/[0.04]" /><div className="h-7 w-full animate-pulse rounded bg-white/[0.04]" /></div></div>)}</div>
}

function EmptyState({ icon: Icon, title, text, accent, action }: { icon: typeof ImageIcon; title: string; text: string; accent: string; action?: { label: string; onClick: () => void } }) {
  return <div className="rounded-lg border border-dashed border-white/15 bg-[#171230]/50 p-12 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg" style={{ background: `${accent}18`, color: accent }}><Icon size={26} /></div><h2 className="mt-5 font-display text-lg font-bold">{title}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-300">{text}</p>{action && <button onClick={action.onClick} className="mt-6 rounded-md arcade-btn bg-[#29e6ff] px-5 py-3 font-display text-xs font-bold tracking-normal text-[#0b0816] hover:bg-[#8ef3ff] shadow-sm">{action.label}</button>}</div>
}

type ArenaPhase = "select" | "queuing" | "revealing" | "result"

const MOVE_META: Record<RpsMove, { icon: typeof Hand; label: string; color: string }> = {
  rock: { icon: HandFist, label: "Rock", color: "#ff3d7f" },
  paper: { icon: Hand, label: "Paper", color: "#29e6ff" },
  scissors: { icon: Scissors, label: "Scissors", color: "#3dff9a" },
}

function CollectionBadge({ collection }: { collection?: string }) {
  const c = isArenaCollection(collection) ? ARENA_COLLECTIONS[collection] : ARENA_COLLECTIONS.mery
  return <span className="shrink-0 rounded px-1.5 py-0.5 font-display text-[11px] font-bold tracking-normal" style={{ background: `${c.color}22`, color: c.color }}>{c.short}</span>
}

type FighterFx = "lunge-right" | "lunge-left" | "victory" | "knockout"
const FX_CLASS: Record<FighterFx, string> = { "lunge-right": "animate-lunge-right", "lunge-left": "animate-lunge-left", victory: "animate-victory", knockout: "animate-knockout" }

function ArenaFighterCard({ nft, wallet, label, accent, crown, dim, fx, move }: { nft?: NftRef | null; wallet?: string; label: string; accent: string; crown?: boolean; dim?: boolean; fx?: FighterFx; move?: RpsMove | null }) {
  const moveMeta = move ? MOVE_META[move] : null
  const MoveIcon = moveMeta?.icon
  return (
    <div className={`relative flex-1 overflow-hidden rounded-xl border bg-[#110d22] ${dim ? "border-white/10 opacity-60" : "border-white/15"} ${fx ? FX_CLASS[fx] : ""}`} style={crown ? { borderColor: accent, boxShadow: `0 0 24px ${accent}55` } : undefined}>
      {crown && <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2"><Crown size={22} style={{ color: accent }} className="" /></div>}
      {moveMeta && MoveIcon && <div className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-[#110d22]/90 animate-pop-in" style={{ borderColor: moveMeta.color, color: moveMeta.color }} title={moveMeta.label}><MoveIcon size={20} /><span className="sr-only">{moveMeta.label}</span></div>}
      <div className="relative aspect-square overflow-hidden"><NftImage src={nft?.image} alt={nft ? arenaNftName(nft) : "Fighter"} id={nft?.nftId || "?"} /><div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#110d22] via-transparent to-transparent" /></div>
      <div className="p-3">
        <div className="font-display text-[11px] tracking-normal" style={{ color: accent }}>{label}</div>
        <div className="mt-0.5 flex items-center gap-1.5"><span className="truncate font-display text-xs font-bold">{nft ? arenaNftName(nft) : "—"}</span>{nft && <CollectionBadge collection={nft.collection} />}</div>
        <div className="mt-0.5 font-mono text-xs text-slate-400">{shortAddr(wallet)}</div>
      </div>
    </div>
  )
}

const SPARK_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]

function FightClash({ mode }: { mode: ArenaMode }) {
  return (
    <div className="relative flex w-14 shrink-0 items-center justify-center sm:w-24" aria-hidden="true">
      <div className="absolute h-20 w-20 rounded-full bg-[#3dff9a] animate-clash-flash" />
      {SPARK_ANGLES.map(a => <span key={a} className="absolute h-0.5 w-5 rounded-full bg-[#3dff9a] animate-spark" style={{ "--angle": `${a}deg` } as React.CSSProperties} />)}
      {mode === "rps"
        ? <HandFist size={32} className="relative text-[#ff3d7f] animate-rps-pump" />
        : <div className="relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#3dff9a] bg-[#110d22] animate-spin"><Coins size={20} className="text-[#3dff9a]" /></div>}
    </div>
  )
}

function GamePanel({ account, onConnect }: { account: string | null; onConnect: () => void }) {
  const me = account?.toLowerCase() ?? ""
  const [phase, setPhase] = useState<ArenaPhase>("select")
  const [mode, setMode] = useState<ArenaMode>("coin")
  const [move, setMove] = useState<RpsMove | null>(null)
  const [filter, setFilter] = useState<"all" | ArenaCollection>("all")
  const [walletNfts, setWalletNfts] = useState<ArenaNft[]>([])
  const [walletLoading, setWalletLoading] = useState(false)
  const [walletError, setWalletError] = useState(false)
  const [selected, setSelected] = useState<ArenaNft | null>(null)
  const [match, setMatch] = useState<ArenaMatch | null>(null)
  const [stats, setStats] = useState<ArenaStats | null>(null)
  const [history, setHistory] = useState<ArenaMatch[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  const stopPolling = () => { if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null } }

  const loadWallet = () => {
    if (!account) return
    setWalletLoading(true); setWalletError(false)
    fetchArenaNfts(account).then(setWalletNfts).catch(() => setWalletError(true)).finally(() => setWalletLoading(false))
  }

  const refreshMeta = () => {
    getArenaStats().then(setStats).catch(() => {})
    if (me) getArenaHistory(me).then(setHistory).catch(() => {})
  }

  useEffect(() => { refreshMeta(); const t = window.setInterval(refreshMeta, 15000); return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me])

  useEffect(() => { if (account && phase === "select") loadWallet()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account])

  useEffect(() => () => stopPolling(), [])

  useEffect(() => {
    if (phase !== "queuing") { setElapsed(0); return }
    const t = window.setInterval(() => setElapsed(e => e + 1), 1000)
    return () => window.clearInterval(t)
  }, [phase])

  const startReveal = () => { setPhase("revealing"); emitFx({ kind: "fight" }); window.setTimeout(() => { setPhase("result"); refreshMeta() }, 3200) }

  const startPolling = (id: string) => {
    stopPolling()
    pollRef.current = window.setInterval(async () => {
      const m = await getMatch(id)
      if (!m) return
      setMatch(m)
      if (m.status === "resolved") { stopPolling(); startReveal() }
    }, 2500)
  }

  const enterArena = async () => {
    if (!account) return onConnect()
    if (!selected || (mode === "rps" && !move)) return
    setBusy(true); setError(null)
    try {
      const m = await joinArena(account, { nftId: selected.nftId, name: selected.name, image: selected.image, collection: selected.collection }, mode, move ?? undefined)
      setMatch(m)
      if (m.status === "resolved") startReveal()
      else { setPhase("queuing"); startPolling(m.id) }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not enter the arena") }
    finally { setBusy(false) }
  }

  const cancelQueue = async () => {
    stopPolling()
    if (match && account) { try { await leaveArena(match.id, account) } catch {} }
    setMatch(null); setPhase("select"); refreshMeta()
  }

  const battleAgain = () => { setMatch(null); setSelected(null); setMove(null); setPhase("select"); if (account) loadWallet() }

  const iAmP1 = match ? match.p1.wallet === me : false
  const mine = match ? (iAmP1 ? match.p1 : match.p2) : null
  const opp = match ? (iAmP1 ? match.p2 : match.p1) : null
  const draw = match?.status === "resolved" && !match.winner
  const won = !!match?.winner && match.winner === me
  const matchMode: ArenaMode = match?.mode ?? mode

  useEffect(() => {
    if (phase === "queuing") emitFx({ kind: "queue" })
    if (phase !== "result" || !match) return
    const winnerNft = won ? opp?.nft : mine?.nft
    emitFx(draw ? { kind: "draw" } : won ? { kind: "win", label: winnerNft ? `Captured ${arenaNftName(winnerNft)}` : undefined } : { kind: "lose" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const counts = { all: walletNfts.length, mery: walletNfts.filter(n => n.collection === "mery").length, lions: walletNfts.filter(n => n.collection === "lions").length }
  const visible = filter === "all" ? walletNfts : walletNfts.filter(n => n.collection === filter)
  const isSelected = (n: ArenaNft) => selected?.nftId === n.nftId && selected?.collection === n.collection

  const statCards = [
    { icon: Swords, label: "Total battles", value: stats ? croFormat(stats.battles) : "—", color: "#a39cc8" },
    { icon: Zap, label: "Battles (24h)", value: stats ? croFormat(stats.battles24h) : "—", color: "#ff3d7f" },
    { icon: Users, label: "Fighters", value: stats ? croFormat(stats.players) : "—", color: "#29e6ff" },
    { icon: Loader2, label: "In queue now", value: stats ? stats.inQueue.toString() : "—", color: "#3dff9a" },
  ]

  const modes: { id: ArenaMode; label: string; hint: string; icon: typeof Coins }[] = [
    { id: "coin", label: "Coin flip", hint: "Pure 50/50 luck", icon: Coins },
    { id: "rps", label: "Rock Paper Scissors", hint: "Outsmart your opponent", icon: Scissors },
  ]

  const resultText = draw
    ? <>You both threw <span className="font-bold text-white">{mine?.move ? MOVE_META[mine.move].label : "the same move"}</span>. It&apos;s a draw, and both fighters walk away with their NFTs.</>
    : won
      ? <>{matchMode === "rps" && mine?.move && opp?.move ? <><span className="font-bold text-white">{MOVE_META[mine.move].label}</span> beats <span className="font-bold text-white">{MOVE_META[opp.move].label}</span>. </> : "The flip landed your way. "}You captured <span className="font-bold text-white">{opp ? arenaNftName(opp.nft) : "their fighter"}</span>, and both NFTs are yours.</>
      : <>{matchMode === "rps" && mine?.move && opp?.move ? <><span className="font-bold text-white">{MOVE_META[opp.move].label}</span> beats <span className="font-bold text-white">{MOVE_META[mine.move].label}</span>. </> : ""}<span className="font-bold text-white">{shortAddr(opp?.wallet)}</span> took <span className="font-bold text-white">{mine ? arenaNftName(mine.nft) : "your fighter"}</span>. Better luck next battle.</>

  const resultColor = draw ? "#29e6ff" : won ? "#3dff9a" : "#ff3d7f"

  return <section>
    <div className="mb-8"><Eyebrow color="pink">GameFi · NFT battler</Eyebrow><h1 className="font-display text-4xl font-bold tracking-tight">MERY <span className="text-[#a39cc8]">Arena</span></h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Put up a <span className="text-[#a39cc8]">MERY</span> or a <span className="text-[#29e6ff]">Loaded Lion</span>, get matched against another holder from either collection, and fight it out with a coin flip or Rock Paper Scissors. <span className="text-white">Winner takes both NFTs.</span> <span className="text-slate-400">Stakes are simulated: nothing actually leaves your wallet.</span></p></div>

    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{statCards.map(({ icon: Icon, label, value, color }) => <div key={label} className="rounded-lg border border-white/10 bg-[#171230]/70 p-4"><div className="flex items-center justify-between font-display text-xs tracking-normal text-slate-400"><span>{label}</span><Icon size={15} style={{ color }} className={label === "In queue now" ? "animate-spin" : ""} /></div><div className="mt-3 font-display text-2xl font-bold" style={{ color }}>{value}</div></div>)}</div>

    <div className={`relative overflow-hidden rounded-2xl border border-[#a39cc8]/25 bg-[#171230]/70 ${phase === "revealing" ? "animate-arena-shake" : ""}`}>
      <div className="pointer-events-none absolute inset-0 opacity-[0.1]" />
      <div className="relative p-5 sm:p-7">
  {!account ? (
  <div className="flex flex-col items-center gap-4 py-6 text-center sm:py-14">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#29e6ff]/15 text-[#29e6ff]"><Swords size={28} /></div>
            <div><h2 className="font-display text-lg font-bold">Enter the arena</h2><p className="mt-1 text-sm text-slate-300">Connect your wallet to put up a MERY or Loaded Lion and battle other holders.</p></div>
            <button onClick={onConnect} className="arcade-btn rounded-md bg-[#29e6ff] px-6 py-3 font-display text-sm font-bold text-[#0b0816] hover:bg-[#8ef3ff]">Connect wallet</button>
          </div>
        ) : phase === "select" ? (
          <div>
            <h2 className="mb-3 font-display text-sm font-bold tracking-normal">1 · Pick a game</h2>
            <div className="mb-7 grid gap-3 sm:grid-cols-2">{modes.map(({ id, label, hint, icon: Icon }) => { const on = mode === id; return (
              <button key={id} onClick={() => setMode(id)} aria-pressed={on} className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${on ? "border-[#ff3d7f] bg-[#ff3d7f]/10" : "border-white/10 bg-white/[0.02] hover:border-white/30"}`}>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${on ? "bg-[#ff3d7f] text-white" : "bg-white/5 text-slate-300"}`}><Icon size={18} /></div>
                <div><div className="font-display text-xs font-bold tracking-normal">{label}</div><div className="mt-0.5 text-xs text-slate-400">{hint}</div></div>
              </button>
            )})}</div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-sm font-bold tracking-normal">2 · Choose your fighter</h2>
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border border-white/10 bg-white/[0.03] p-0.5" role="group" aria-label="Filter by collection">{(["all", "mery", "lions"] as const).map(f => <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`rounded px-2.5 py-1 font-display text-xs font-bold tracking-normal transition ${filter === f ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}>{f === "all" ? "All" : ARENA_COLLECTIONS[f].short} <span className="text-slate-400">{counts[f]}</span></button>)}</div>
                <button onClick={loadWallet} className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 font-display text-xs font-bold tracking-normal text-slate-300 transition hover:text-white"><RefreshCw size={12} className={walletLoading ? "animate-spin" : ""} />Refresh</button>
              </div>
            </div>
            {walletLoading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />)}</div>
            ) : walletError ? (
              <EmptyState icon={AlertTriangle} title="Could not load your NFTs" text="Ebisu's Bay didn't respond. Try refreshing in a moment." accent="#ff3d7f" />
            ) : walletNfts.length === 0 ? (
              <EmptyState icon={ImageIcon} title="No fighters in your wallet" text="You need at least one Mistery on Cro or Loaded Lions NFT to enter the arena." accent="#a39cc8" />
            ) : visible.length === 0 ? (
              <EmptyState icon={ImageIcon} title={`No ${filter === "lions" ? "Loaded Lions" : "MERY"} here`} text="Switch the filter to see your other fighters." accent="#a39cc8" />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{visible.map(nft => { const on = isSelected(nft); const c = ARENA_COLLECTIONS[nft.collection]; return (
                <button key={`${nft.collection}-${nft.nftId}`} onClick={() => setSelected(nft)} aria-pressed={on} className={`group relative overflow-hidden rounded-xl border text-left transition ${on ? "" : "border-white/10 hover:border-white/30"}`} style={on ? { borderColor: c.color, boxShadow: `0 0 22px ${c.color}55` } : undefined}>
                  <div className="relative aspect-square overflow-hidden"><NftImage src={nft.image} alt={arenaNftName(nft)} id={nft.nftId} />{on && <div className="absolute inset-0 flex items-center justify-center" style={{ background: `${c.color}33` }}><span className="rounded-md px-2 py-1 font-display text-[11px] font-bold tracking-normal text-[#0b0816]" style={{ background: c.color }}>Selected</span></div>}</div>
                  <div className="flex items-center gap-1.5 p-2.5"><span className="truncate font-display text-[13px] font-bold">{arenaNftName(nft)}</span><CollectionBadge collection={nft.collection} /></div>
                </button>
              )})}</div>
            )}

            {mode === "rps" && walletNfts.length > 0 && (
              <div className="mt-7">
                <h2 className="mb-1 font-display text-sm font-bold tracking-normal">3 · Lock your move</h2>
                <p className="mb-3 text-xs text-slate-400">Your move stays sealed on the server until the match resolves, so your opponent can&apos;t see it.</p>
                <div className="grid grid-cols-3 gap-3">{RPS_MOVES.map(m => { const meta = MOVE_META[m]; const Icon = meta.icon; const on = move === m; return (
                  <button key={m} onClick={() => setMove(m)} aria-pressed={on} className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 transition ${on ? "" : "border-white/10 bg-white/[0.02] hover:border-white/30"}`} style={on ? { borderColor: meta.color, background: `${meta.color}14`, boxShadow: `0 0 18px ${meta.color}44` } : undefined}>
                    <Icon size={28} style={on ? { color: meta.color } : undefined} className={on ? "" : "text-slate-300"} />
                    <span className="font-display text-[13px] font-bold tracking-normal">{meta.label}</span>
                  </button>
                )})}</div>
              </div>
            )}

            {error && <div className="mt-4 flex items-center gap-2 rounded-md border border-[#ff3d7f]/40 bg-[#ff3d7f]/10 px-3 py-2 font-display text-xs text-[#ff85ad]"><AlertTriangle size={14} />{error}</div>}
            {walletNfts.length > 0 && <button onClick={enterArena} disabled={!selected || busy || (mode === "rps" && !move)} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg arcade-btn bg-[#29e6ff] text-[#0b0816] px-6 py-4 font-display text-sm font-bold tracking-normal transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 glow-purple">{busy ? <><Loader2 size={16} className="animate-spin" />Entering…</> : !selected ? <><Swords size={16} />Pick a fighter</> : mode === "rps" && !move ? <><Scissors size={16} />Lock a move</> : <><Swords size={16} />Fight with {arenaNftName(selected)}</>}</button>}
          </div>
        ) : phase === "queuing" ? (
          <div className="py-6">
            <div className="mb-6 flex items-center justify-center gap-2 font-display text-xs font-bold tracking-normal text-[#29e6ff]"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#29e6ff] opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#29e6ff]" /></span>{matchMode === "rps" ? "Rock Paper Scissors" : "Coin flip"} · Searching for an opponent · {elapsed}s</div>
            <div className="flex items-stretch gap-3 sm:gap-5">
              <ArenaFighterCard label="You" nft={selected} wallet={me} accent="#a39cc8" move={matchMode === "rps" ? move : null} />
              <div className="flex shrink-0 items-center"><div className="font-display text-2xl font-bold text-slate-400">VS</div></div>
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-[#110d22] p-4 text-center"><Loader2 size={26} className="animate-spin text-slate-400" /><div className="mt-3 font-display text-xs tracking-normal text-slate-400">Waiting for<br />a challenger</div></div>
            </div>
            <div className="mt-6 flex flex-col items-center gap-3"><p className="max-w-md text-center text-xs leading-5 text-slate-400">You&apos;re in the live queue. When another MERY or Loaded Lions holder picks the same game, you&apos;ll be matched and the fight starts automatically.{matchMode === "rps" && " Only you can see your move."}</p><button onClick={cancelQueue} className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-4 py-2 font-display text-xs font-bold tracking-normal text-slate-300 transition hover:text-white"><X size={13} />Leave queue</button></div>
          </div>
        ) : phase === "revealing" ? (
          <div className="py-6">
            <div className="mb-6 text-center font-display text-xs font-bold tracking-normal text-[#3dff9a]">{matchMode === "rps" ? "Rock… Paper… Scissors… Shoot!" : "Fighters clash… flipping the coin of fate"}</div>
            <div className="flex items-stretch gap-1 sm:gap-2">
              <ArenaFighterCard label="You" nft={mine?.nft} wallet={mine?.wallet} accent="#a39cc8" fx="lunge-right" />
              <FightClash mode={matchMode} />
              <ArenaFighterCard label="Opponent" nft={opp?.nft} wallet={opp?.wallet} accent="#ff3d7f" fx="lunge-left" />
            </div>
          </div>
        ) : (
          <div className="py-4">
            <div className="mb-6 flex flex-col items-center gap-2 rounded-xl border p-5 text-center animate-pop-in" style={{ borderColor: `${resultColor}55`, background: `${resultColor}12` }}>
              {draw ? <Hand size={28} className="text-[#29e6ff]" /> : won ? <Crown size={30} className="text-[#3dff9a]" /> : <Skull size={28} className="text-[#ff3d7f]" />}
              <div className="font-display text-2xl font-bold tracking-tight" style={{ color: resultColor }}>{draw ? "Draw" : won ? "Victory" : "Defeated"}</div>
              <p className="max-w-md text-xs leading-5 text-slate-300">{resultText}</p>
              <span className="mt-1 rounded-md bg-white/5 px-2 py-0.5 font-display text-[11px] tracking-normal text-slate-400">Simulated stake · no transfer</span>
            </div>
            <div className="flex items-stretch gap-3 sm:gap-5">
              <ArenaFighterCard label="You" nft={mine?.nft} wallet={mine?.wallet} accent="#a39cc8" crown={won} dim={!won && !draw} move={mine?.move} fx={draw ? undefined : won ? "victory" : "knockout"} />
              <div className="flex shrink-0 items-center"><div className="font-display text-lg font-bold text-slate-400">VS</div></div>
              <ArenaFighterCard label="Opponent" nft={opp?.nft} wallet={opp?.wallet} accent="#ff3d7f" crown={!won && !draw} dim={won} move={opp?.move} fx={draw ? undefined : won ? "knockout" : "victory"} />
            </div>
            <button onClick={battleAgain} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg arcade-btn bg-[#29e6ff] text-[#0b0816] px-6 py-4 font-display text-sm font-bold tracking-normal transition hover:brightness-110 glow-purple"><Swords size={16} />Battle again</button>
          </div>
        )}
      </div>
    </div>

    {history.length > 0 && (
      <div className="mt-8">
        <h2 className="mb-4 font-display text-sm font-bold tracking-normal text-slate-300">Your recent battles</h2>
        <div className="overflow-hidden arcade-panel rounded-xl border border-white/15 bg-[#171230]/70">
          {history.map((m, i) => {
            const p1me = m.p1.wallet === me
            const myF = p1me ? m.p1 : m.p2
            const oppF = p1me ? m.p2 : m.p1
            const d = !m.winner
            const w = m.winner === me
            return (
              <div key={m.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-white/5" : ""}`}>
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-white/10"><NftImage src={myF?.nft.image} alt="Your fighter" id={myF?.nft.nftId || "?"} /></div>
                <div className="min-w-0 flex-1"><div className="truncate font-display text-xs font-bold">{myF ? arenaNftName(myF.nft) : "—"} <span className="text-slate-400">vs</span> {oppF ? arenaNftName(oppF.nft) : "—"}</div><div className="flex items-center gap-2 font-mono text-xs text-slate-400"><span>{shortAddr(oppF?.wallet)}</span><span className="font-display tracking-normal text-slate-400">{m.mode === "rps" ? "RPS" : "Coin"}</span></div></div>
                <span className={`shrink-0 rounded-md px-2.5 py-1 font-display text-[11px] font-bold tracking-normal ${d ? "bg-[#29e6ff]/15 text-[#29e6ff]" : w ? "bg-[#3dff9a]/15 text-[#3dff9a]" : "bg-[#ff3d7f]/15 text-[#ff85ad]"}`}>{d ? "Draw" : w ? "Won" : "Lost"}</span>
              </div>
            )
          })}
        </div>
      </div>
    )}
  </section>
}

function TokenBox({ label, token, amount, onAmount, onPick, readOnly, loading, account, balance, balancesLoading, onMax }: any) {
  const hasBalance = balance !== undefined && Number(balance) > 0
  return <div className="arcade-panel rounded-xl border border-white/15 bg-[#171230]/80 p-4 transition focus-within:border-[#29e6ff]/40"><div className="mb-3 flex items-center justify-between font-display text-xs tracking-normal text-slate-400"><span>{label}</span><span className="flex items-center gap-2">Balance {!account ? "—" : balancesLoading && balance === undefined ? <span className="inline-block h-3 w-10 animate-pulse rounded bg-white/10" /> : <span className="text-slate-300">{formatBalance(balance)}</span>}{!readOnly && account && hasBalance && onMax && <button onClick={onMax} className="rounded border border-[#3dff9a]/40 px-1.5 py-0.5 font-display text-[11px] font-bold tracking-normal text-[#3dff9a] hover:bg-[#3dff9a]/10">Max</button>}</span></div><div className="flex items-center gap-3"><input value={amount} onChange={e => onAmount(e.target.value)} readOnly={readOnly} inputMode="decimal" placeholder="0.00" className="min-w-0 flex-1 bg-transparent font-display text-3xl font-bold tracking-tight outline-none placeholder:text-slate-700" /><button onClick={onPick} className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 font-display text-sm font-bold hover:border-[#29e6ff]/40 hover:bg-white/10"><TokenIcon token={token} size="sm" /><span>{token.symbol}</span><ChevronDown size={15} className="text-slate-400" /></button></div>{loading && <div className="mt-2 flex items-center gap-1.5 font-display text-xs tracking-normal text-[#29e6ff] animate-arcade-pulse"><Zap size={12} />Fetching best route...</div>}</div>
}

function TokenPicker({ onSelect, onClose, excludeAddress, tokens }: { onSelect: (t: Token) => void; onClose: () => void; excludeAddress?: string; tokens: Token[] }) {
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const filtered = tokens.filter(t => {
    if (!q) return true
    return t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase() === q
  })
  // Cap the rendered rows so a 500+ token whitelist stays responsive; the full
  // set is always reachable through search.
  const list = filtered.slice(0, 80)
  const hidden = filtered.length - list.length
  return <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 p-4 pt-24 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Select a token"><div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#29e6ff]/30 bg-[#110d22] shadow-2xl shadow-sm" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between border-b border-white/10 p-4"><h2 className="font-display text-lg font-bold">Select a token</h2><button onClick={onClose} className="rounded-md p-1.5 text-slate-300 hover:bg-white/5 hover:text-white" aria-label="Close"><X size={18} /></button></div><div className="p-4"><div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3"><Search size={16} className="text-[#29e6ff]" /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, symbol, or paste address" className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-400" /></div></div><div className="max-h-80 overflow-y-auto px-2 pb-3">{list.length === 0 ? <div className="px-4 py-8 text-center text-sm text-slate-400">No tokens found.</div> : list.map(t => { const disabled = t.address.toLowerCase() === excludeAddress?.toLowerCase(); return <button key={t.address} disabled={disabled} onClick={() => onSelect(t)} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"><TokenIcon token={t} size="sm" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2 font-display text-xs font-bold">{t.symbol}{isMery(t.address) && <ScoreBoost />}</div><div className="truncate text-xs text-slate-400">{t.name}</div></div>{disabled && <span className="font-display text-[11px] tracking-wide text-slate-400">Selected</span>}{t.imported && !disabled && <span className="font-display text-[11px] tracking-wide text-slate-400">Whitelist</span>}</button> })}{hidden > 0 && <div className="px-4 py-3 text-center font-display text-xs tracking-normal text-slate-400">{hidden} more — refine your search</div>}</div></div></div>
}
