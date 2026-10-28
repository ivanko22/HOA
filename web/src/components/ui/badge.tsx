import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium tracking-wide border",
  {
    variants: {
      variant: {
        verified:
          "bg-emerald-50 text-emerald-900 border-emerald-200",
        reported: "bg-sky-50 text-sky-900 border-sky-200",
        estimated: "bg-amber-50 text-amber-950 border-amber-200",
        needs_review: "bg-orange-50 text-orange-950 border-orange-200",
        conflicting: "bg-rose-50 text-rose-950 border-rose-200",
        unknown: "bg-slate-100 text-slate-700 border-slate-200",
        default: "bg-slate-50 text-slate-800 border-slate-200",
        available: "bg-emerald-50 text-emerald-900 border-emerald-200",
        missing: "bg-rose-50 text-rose-950 border-rose-200",
        needs_reconciliation:
          "bg-orange-50 text-orange-950 border-orange-200",
        pending: "bg-amber-50 text-amber-950 border-amber-200",
        processing: "bg-slate-100 text-slate-800 border-slate-200",
        source_only: "bg-slate-50 text-slate-700 border-slate-200",
        partially_verified: "bg-sky-50 text-sky-950 border-sky-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
