import type { ReactNode } from "react";

import { SidebarContent, SidebarGroup } from "../ui/sidebar";
import { HostList } from "../ui/hostElements";
import { TooltipProvider } from "../ui/tooltip";
import { SidebarChromeFooter, SidebarChromeHeader } from "./SidebarChrome";
import {
  SidebarV2ControlsSurface,
  SidebarV2EmptyStateSurface,
  type SidebarV2ControlsSurfaceProps,
} from "./SidebarV2ControlsSurface";

type HostListProps = Parameters<typeof HostList>[0];
type HostListRef = HostListProps extends { readonly ref?: infer Ref } ? Ref : never;

export interface SidebarV2CompositionSurfaceProps {
  readonly isElectron: boolean;
  readonly controls: SidebarV2ControlsSurfaceProps;
  readonly rows: ReactNode;
  readonly rowCount: number;
  readonly listId?: string | undefined;
  readonly listRole?: "list" | "listbox" | undefined;
  readonly listAriaLabel?: string | undefined;
  readonly emptyState?: ReactNode | undefined;
  readonly hasProjects: boolean;
  readonly scopedDisplayName: string | null;
  readonly onAddProjectClick: SidebarV2ControlsSurfaceProps["onNewProjectClick"];
  readonly listRef?: HostListRef;
  readonly afterContent?: ReactNode;
}

/**
 * Maximum renderer-neutral Sidebar V2 composition boundary.
 *
 * Web and Lynx retain only state, data projection, and renderer-specific rich
 * controls outside this component. Header/footer chrome, both control rows,
 * scroll/content structure, thread-list ownership, and empty-state placement
 * are one shared subtree.
 */
export function SidebarV2CompositionSurface(props: SidebarV2CompositionSurfaceProps) {
  return (
    <>
      <SidebarChromeHeader isElectron={props.isElectron} />
      <SidebarContent
        className="gap-0"
        fixedHeader={<SidebarV2ControlsSurface {...props.controls} />}
      >
        <SidebarGroup className="sidebar-v2-thread-group px-2 pb-1 pt-0">
          <TooltipProvider
            key="sidebar-thread-tooltips-150"
            delay={150}
            closeDelay={0}
            timeout={400}
          >
            <HostList
              ref={props.listRef}
              id={props.listId}
              role={props.listRole ?? "list"}
              aria-label={props.listAriaLabel}
              className="sidebar-v2-thread-list flex flex-col gap-px"
              data-testid="sidebar-v2-thread-list"
            >
              {props.rows}
            </HostList>
          </TooltipProvider>
          {props.rowCount === 0
            ? (props.emptyState ?? (
                <SidebarV2EmptyStateSurface
                  hasProjects={props.hasProjects}
                  scopedDisplayName={props.scopedDisplayName}
                  onAddProjectClick={props.onAddProjectClick}
                />
              ))
            : null}
        </SidebarGroup>
      </SidebarContent>
      {props.afterContent}
      <SidebarChromeFooter />
    </>
  );
}
