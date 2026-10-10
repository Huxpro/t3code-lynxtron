export interface ExpandedImageItem {
  readonly src: string;
  readonly name: string;
}

export interface ExpandedImagePreview {
  readonly images: ReadonlyArray<ExpandedImageItem>;
  readonly index: number;
}

export function buildExpandedImagePreview(
  images: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly previewUrl?: string | undefined;
  }>,
  selectedImageId: string,
): ExpandedImagePreview | null {
  const previewableImages = images.flatMap((image) =>
    image.previewUrl ? [{ id: image.id, src: image.previewUrl, name: image.name }] : [],
  );
  const selectedIndex = previewableImages.findIndex((image) => image.id === selectedImageId);
  if (selectedIndex < 0) return null;
  return {
    images: previewableImages.map(({ src, name }) => ({ src, name })),
    index: selectedIndex,
  };
}
