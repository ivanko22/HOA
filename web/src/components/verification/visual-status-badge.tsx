import type { VisualVerificationStatus } from "@/lib/domain/enums";
import { visualStatusLabel } from "@/lib/domain/visual-verification";
import { Badge } from "@/components/ui/badge";

export function VisualStatusBadge({
  status,
}: {
  status: VisualVerificationStatus;
}) {
  const variant =
    status === "visual_match"
      ? "verified"
      : status === "mismatch"
        ? "conflicting"
        : status === "ambiguous"
          ? "pending"
          : "default";
  return <Badge variant={variant}>{visualStatusLabel(status)}</Badge>;
}
