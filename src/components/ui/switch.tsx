import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

/**
 * Interrupteur MODERNISÉ — fini la grosse pilule on/off : un segmenté compact
 * « Non | Oui » (le segment actif est rempli — bleu marque pour Oui, gris pour
 * Non). Même API Radix qu'avant (checked / onCheckedChange / disabled / id…),
 * donc TOUS les usages du site sont modernisés d'un coup sans rien changer
 * ailleurs. Accessibilité conservée (role="switch" natif Radix).
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "group inline-flex shrink-0 cursor-pointer items-center rounded-full bg-muted p-0.5",
      "transition-all duration-200",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
    ref={ref}
  >
    <span
      aria-hidden="true"
      className={cn(
        "rounded-full px-3 py-1 text-[11px] font-semibold leading-none transition-all duration-200",
        "group-data-[state=unchecked]:bg-slate-500 group-data-[state=unchecked]:text-white group-data-[state=unchecked]:shadow",
        "group-data-[state=checked]:text-muted-foreground",
      )}
    >
      Non
    </span>
    <span
      aria-hidden="true"
      className={cn(
        "rounded-full px-3 py-1 text-[11px] font-semibold leading-none transition-all duration-200",
        "group-data-[state=checked]:bg-gradient-to-r group-data-[state=checked]:from-[#2994C0] group-data-[state=checked]:to-[#1E6B8C] group-data-[state=checked]:text-white group-data-[state=checked]:shadow",
        "group-data-[state=unchecked]:text-muted-foreground",
      )}
    >
      Oui
    </span>
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
