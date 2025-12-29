import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-[#27272a] placeholder:text-[#a1a1aa] focus-visible:border-white/30 focus-visible:ring-white/30 aria-invalid:ring-destructive/20 aria-invalid:border-destructive bg-[rgba(24,24,27,0.8)] backdrop-blur-sm flex field-sizing-content min-h-16 w-full rounded-md border px-3 py-2 text-base text-white shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
