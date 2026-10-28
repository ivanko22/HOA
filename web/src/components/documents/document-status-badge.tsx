import type { DocumentProcessingStatus } from "@/lib/domain/enums";
import { Badge } from "@/components/ui/badge";

const labels: Record<DocumentProcessingStatus, string> = {
  processing: "Processing",
  needs_review: "Needs Review",
  source_only: "Source Only",
  partially_verified: "Partially Verified",
  verified: "Verified",
};

export function DocumentStatusBadge({
  status,
  className,
}: {
  status: DocumentProcessingStatus;
  className?: string;
}) {
  return (
    <Badge variant={status} className={className}>
      {labels[status]}
    </Badge>
  );
}
