import { ArrowRight } from "lucide-react"

export function LaunchButton({ href, size = "lg", label = "Launch app" }: { href: string; size?: "sm" | "lg"; label?: string }) {
  const sizing = size === "sm" ? "px-4 py-2 text-xs" : "px-6 py-3.5 text-sm"
  return (
    <a
      href={href}
      className={`inline-flex shrink-0 items-center gap-2 rounded-md bg-[#ff2d95] font-display font-bold uppercase tracking-wider text-[#0a0510] transition hover:bg-[#22e4ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22e4ff] glow-pink ${sizing}`}
    >
      {label}
      <ArrowRight size={size === "sm" ? 14 : 16} aria-hidden />
    </a>
  )
}
