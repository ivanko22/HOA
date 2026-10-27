import type { VerificationStatus } from "@/lib/domain/enums";
import { Badge } from "@/components/ui/badge";

const labels: Record<VerificationStatus, string> = {
  verified: "Verified",
  reported: "Reported",
  estimated: "Estimated",
  needs_review: "Needs Review",
  conflicting: "Conflicting",
  unknown: "Unknown",
};

export function StatusBadge({
  status,
  className,
}: {
  status: VerificationStatus;
  className?: string;
}) {
  return (
    <Badge variant={status} className={className}>
      {labels[status]}
    </Badge>
  );
}
