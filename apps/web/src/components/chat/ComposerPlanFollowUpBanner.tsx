import { memo } from "react";
import { ComposerPlanFollowUpSurface } from "./ComposerPlanFollowUpSurface";

export const ComposerPlanFollowUpBanner = memo(function ComposerPlanFollowUpBanner({
  planTitle,
}: {
  planTitle: string | null;
}) {
  return <ComposerPlanFollowUpSurface planTitle={planTitle} />;
});
