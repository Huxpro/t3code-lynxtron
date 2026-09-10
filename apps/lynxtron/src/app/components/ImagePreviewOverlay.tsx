import { useCallback, useEffect, useState } from "@lynx-js/react";
import type { ExpandedImagePreview } from "@t3tools/client-runtime/presentation/image-preview";

import { Icon } from "./Icon";

export function ImagePreviewOverlay({
  preview,
  onClose,
}: {
  readonly preview: ExpandedImagePreview;
  readonly onClose: () => void;
}) {
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [preview]);
  const index = (preview.index + offset + preview.images.length) % preview.images.length;
  const item = preview.images[index];
  const previous = useCallback(() => setOffset((value) => value - 1), []);
  const next = useCallback(() => setOffset((value) => value + 1), []);
  if (!item) return null;

  return (
    <view className="image-preview-overlay" aria-label="Expanded image preview">
      <view
        className="image-preview-overlay__dismiss"
        aria-label="Close image preview"
        bindtap={onClose}
      />
      <view className="image-preview-overlay__content">
        <view
          className="image-preview-overlay__close"
          aria-label="Close image preview"
          bindtap={onClose}
        >
          <Icon name="x" size={16} color="#f4f4f5" />
        </view>
        <image className="image-preview-overlay__image" src={item.src} mode="aspectFit" />
        <text className="image-preview-overlay__caption" text-maxline="1">
          {item.name}
          {preview.images.length > 1 ? ` (${index + 1}/${preview.images.length})` : ""}
        </text>
      </view>
      {preview.images.length > 1 ? (
        <>
          <view
            className="image-preview-overlay__previous"
            aria-label="Previous image"
            bindtap={previous}
          >
            <Icon
              name="chevron-right"
              size={20}
              color="#f4f4f5"
              className="image-preview-overlay__previous-icon"
            />
          </view>
          <view className="image-preview-overlay__next" aria-label="Next image" bindtap={next}>
            <Icon name="chevron-right" size={20} color="#f4f4f5" />
          </view>
        </>
      ) : null}
    </view>
  );
}
