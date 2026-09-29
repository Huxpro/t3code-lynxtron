import type { ReactNode } from "react";
import { HostButton, HostText, HostView } from "../ui/hostElements";

export function ComposerImageAttachmentSurface({
  name,
  preview,
  warning,
  removeIcon,
  onPreview,
  onRemove,
}: {
  readonly name: string;
  readonly preview?: ReactNode;
  readonly warning?: ReactNode;
  readonly removeIcon: ReactNode;
  readonly onPreview?: () => void;
  readonly onRemove: () => void;
}) {
  return (
    <HostView className="composer-image-attachment relative h-16 w-16 overflow-hidden rounded-lg border border-border/80 bg-background">
      {preview ? (
        <HostButton
          aria-label={`Preview ${name}`}
          className="composer-image-attachment-preview h-full w-full"
          onClick={onPreview}
        >
          {preview}
        </HostButton>
      ) : (
        <HostView className="composer-image-attachment-fallback flex h-full w-full items-center justify-center px-1">
          <HostText className="text-center text-[10px] text-muted-foreground/70">{name}</HostText>
        </HostView>
      )}
      {warning}
      <HostButton
        aria-label={`Remove ${name}`}
        className="composer-image-attachment-remove absolute right-1 top-1"
        onClick={onRemove}
      >
        {removeIcon}
      </HostButton>
    </HostView>
  );
}
