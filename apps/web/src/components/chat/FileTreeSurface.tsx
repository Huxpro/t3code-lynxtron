/**
 * Renderer-neutral file-tree row composition (AR5.3).
 *
 * One physical module owns the tree-row anatomy shared by Web's
 * ChangedFilesTree and the Lynx diff/files panels: indentation rhythm,
 * directory rows (chevron + folder icon + name + trailing stats) and file
 * rows (leading spacer/icon + name + trailing stats). Icons, chevrons, and
 * stat labels are platform leaves; expansion and selection state stay with
 * the behavior host. Hover and focus-visible utilities are Web-layer
 * affordances (R6) that the Lynx build strips.
 */
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { HostButton, HostText, HostView } from "../ui/hostElements";

const ROW_CLASS =
  "file-tree-row group flex w-full items-center gap-1.5 rounded-xl py-1 pr-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

function rowPaddingLeft(depth: number): string {
  return `${8 + depth * 14}px`;
}

export interface FileTreeRowBaseProps {
  readonly name: string;
  /** Zero-based tree depth; drives the 8 + depth * 14 indentation rhythm. */
  readonly depth: number;
  /** Trailing slot (diff stat label). */
  readonly trailing?: ReactNode;
  /** Web transcript scroll anchors ignore this row's interactions. */
  readonly scrollAnchorIgnore?: boolean;
}

/** One directory row: chevron, folder icon, name, trailing stats. */
export function FileTreeDirectoryRowSurface({
  name,
  depth,
  trailing,
  scrollAnchorIgnore = false,
  expanded,
  chevron,
  folderIcon,
  onToggle,
}: FileTreeRowBaseProps & {
  readonly expanded: boolean;
  /** Platform chevron leaf; the surface owns the expanded rotation. */
  readonly chevron: ReactNode;
  /** Platform folder icon leaf (omitted where the host has none). */
  readonly folderIcon?: ReactNode;
  readonly onToggle: () => void;
}) {
  return (
    <HostButton
      type="button"
      {...(scrollAnchorIgnore ? { "data-scroll-anchor-ignore": true } : {})}
      className={cn(ROW_CLASS, "file-tree-row--directory")}
      style={{ paddingLeft: rowPaddingLeft(depth) }}
      onClick={onToggle}
      aria-expanded={expanded}
    >
      <HostText
        aria-hidden
        className={cn(
          "file-tree-row__chevron",
          "inline-flex size-3.5 shrink-0 items-center text-muted-foreground/70 transition-transform group-hover:text-foreground/80",
          expanded && "file-tree-row__chevron--expanded rotate-90",
        )}
      >
        {chevron}
      </HostText>
      {folderIcon}
      <HostText className="file-tree-row__name truncate font-mono text-[11px] leading-4 text-muted-foreground/90 group-hover:text-foreground/90">
        {name}
      </HostText>
      {trailing ? (
        <HostText className="file-tree-row__stat ml-auto shrink-0 font-mono text-[10px] leading-4 tabular-nums">
          {trailing}
        </HostText>
      ) : null}
    </HostButton>
  );
}

/** One file row: optional leading spacer, file icon, name, trailing stats. */
export function FileTreeFileRowSurface({
  name,
  depth,
  trailing,
  fileIcon,
  showLeadingSpacer = false,
  selected = false,
  onSelect,
}: FileTreeRowBaseProps & {
  /** Platform file icon leaf. */
  readonly fileIcon?: ReactNode;
  /** Keep file names aligned with directory names under mixed trees. */
  readonly showLeadingSpacer?: boolean;
  readonly selected?: boolean;
  readonly onSelect?: (() => void) | undefined;
}) {
  const content = (
    <>
      {showLeadingSpacer ? <HostText aria-hidden className="size-3.5 shrink-0" /> : null}
      {fileIcon}
      <HostText className="file-tree-row__name truncate font-mono text-[11px] leading-4 text-muted-foreground/80 group-hover:text-foreground/90">
        {name}
      </HostText>
      {trailing ? (
        <HostText className="file-tree-row__stat ml-auto shrink-0 font-mono text-[10px] leading-4 tabular-nums">
          {trailing}
        </HostText>
      ) : null}
    </>
  );
  const style = { paddingLeft: rowPaddingLeft(depth) };
  if (!onSelect) {
    return (
      <HostView className={cn(ROW_CLASS, "file-tree-row--file")} style={style}>
        {content}
      </HostView>
    );
  }
  return (
    <HostButton
      type="button"
      className={cn(
        ROW_CLASS,
        "file-tree-row--file",
        selected && "file-tree-row--selected bg-accent",
      )}
      style={style}
      onClick={onSelect}
    >
      {content}
    </HostButton>
  );
}

/** Children container for expanded directory contents. */
export function FileTreeChildrenSurface({ children }: { readonly children: ReactNode }) {
  return <HostView className="file-tree-children flex flex-col gap-0.5">{children}</HostView>;
}
