import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/* The JCI Intelligence actions (styles/jci.css, BRAND.md section 7):
   - default: the one JCI red button. Its fill grows from where the pointer enters.
   - outline, secondary: a hairline box that fills with ink.
   - ghost, link: words with an underline that draws in.
   - destructive: a red outline that fills with red.
   - icon size: square. */
const buttonVariants = cva(
  "btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border text-[13.5px] font-medium tracking-[-0.005em] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "btn--primary",
        destructive: "btn--danger",
        outline: "btn--secondary",
        secondary: "btn--secondary",
        ghost: "",
        link: "",
      },
      size: {
        default: "h-control px-4",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-11 px-6 text-sm",
        icon: "h-control w-control",
      },
    },
    compoundVariants: [
      { variant: ["ghost", "link"], size: ["default", "sm", "lg"], class: "btn--words" },
      { variant: ["ghost", "link"], size: "icon", class: "btn--icon" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/** Records where the pointer crossed the button's edge, as the origin of its fill. */
function setFillOrigin(event: React.PointerEvent<HTMLElement>) {
  const node = event.currentTarget
  const box = node.getBoundingClientRect()
  if (!box.width || !box.height) return
  node.style.setProperty("--ex", `${(((event.clientX - box.left) / box.width) * 100).toFixed(1)}%`)
  node.style.setProperty("--ey", `${(((event.clientY - box.top) / box.height) * 100).toFixed(1)}%`)
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onPointerEnter, onPointerLeave, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onPointerEnter={(event: React.PointerEvent<HTMLButtonElement>) => {
          setFillOrigin(event)
          onPointerEnter?.(event)
        }}
        onPointerLeave={(event: React.PointerEvent<HTMLButtonElement>) => {
          setFillOrigin(event)
          onPointerLeave?.(event)
        }}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
