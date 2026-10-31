import { ArrowRight } from "lucide-react"

export function LaunchButton({ href, size = "lg", label = "Press start" }: { href: string; size?: "sm" | "lg"; label?: string }) {
  const sizing = size === "sm" ? "px-4 py-2 text-sm" : "px-6 py-3.5 text-lg"
  return (
    <a
      href={href}
      className={`arcade-btn inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#f2b33d] font-display font-bold text-[#0e0f12] hover:bg-[#f7c766] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f2b33d] ${sizing}`}
    >
      {label}
      <ArrowRight size={size === "sm" ? 14 : 18} aria-hidden />
    </a>
  )
}
