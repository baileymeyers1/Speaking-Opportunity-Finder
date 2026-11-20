import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/* Tags in the JCI Intelligence system: a hairline outline, 6px corners, never a pill.
   Status (good, warning, critical) keeps the label in secondary ink and puts the colour on the icon, so a
   status tag always carries an icon. "default" is the one solid tag, for a count or the live state. */
const badgeVariants = cva(
  "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 text-xs font-medium leading-none transition-colors [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-foreground text-background",
        secondary: "border-border text-muted-foreground",
        outline: "border-border text-foreground",
        destructive: "border-critical/35 text-critical",
        good: "border-border text-muted-foreground [&_svg]:text-good",
        warning: "border-border text-muted-foreground [&_svg]:text-warning",
        critical: "border-border text-muted-foreground [&_svg]:text-critical",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

// Forwards its ref: a tag is often a tooltip's trigger, and the tooltip anchors to that ref.
const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  )
)
Badge.displayName = "Badge"

export { Badge, badgeVariants }
