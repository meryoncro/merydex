import { ArrowRight } from "lucide-react"

export function LaunchButton({ href, size = "lg", label = "Open app" }: { href: string; size?: "sm" | "lg"; label?: string }) {
  const sizing = size === "sm" ? "px-4 py-2 text-sm" : "px-5 py-3 text-base"
  return (
    <a
      href={href}
      className={`inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#f2b33d] font-semibold text-[#0e0f12] transition hover:bg-[#f7c766] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2b33d] ${sizing}`}
    >
      {label}
      <ArrowRight size={size === "sm" ? 14 : 16} aria-hidden />
    </a>
  )
}
