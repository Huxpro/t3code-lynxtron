import { useMemo, useState } from "react";
import { redactSourceControlAccount } from "@t3tools/client-runtime/presentation/source-control";

import { cn } from "../../lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function RedactedSensitiveText(props: {
  readonly value: string | null | undefined;
  readonly ariaLabel: string;
  readonly revealTooltip: string;
  readonly hideTooltip: string;
  readonly className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const value = props.value?.trim();
  const redacted = useMemo(() => (value ? redactSourceControlAccount(value) : ""), [value]);

  if (!value) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className={cn(
              "min-w-0 cursor-pointer rounded-sm font-mono text-[11px] leading-none transition hover:text-foreground",
              revealed ? "text-muted-foreground" : "select-none text-muted-foreground blur-[2px]",
              props.className,
            )}
            onClick={() => setRevealed((current) => !current)}
            aria-label={props.ariaLabel}
          >
            {revealed ? value : redacted}
          </button>
        }
      />
      <TooltipPopup side="top">{revealed ? props.hideTooltip : props.revealTooltip}</TooltipPopup>
    </Tooltip>
  );
}
