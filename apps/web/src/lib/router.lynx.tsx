import type { ReactNode } from "react";

import { navigate as navigateLynx, usePathname } from "../../../lynxtron/src/app/router";

function paramsFromPathname(pathname: string): Record<string, string> {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "draft" && segments[1]) {
    return { draftId: segments[1] };
  }
  if (segments[0] !== "settings" && segments[0] && segments[1]) {
    return { environmentId: segments[0], threadId: segments[1] };
  }
  return {};
}

function resolveTo(input: {
  readonly to?: string;
  readonly params?: Record<string, string>;
}): string {
  let to = input.to ?? "/";
  for (const [key, value] of Object.entries(input.params ?? {})) {
    to = to.replace(`$${key}`, value);
  }
  return to;
}

function navigate(input: {
  readonly to?: string;
  readonly params?: Record<string, string>;
  readonly replace?: boolean;
}): Promise<void> {
  navigateLynx(resolveTo(input), { replace: input.replace });
  return Promise.resolve();
}

export function useNavigate() {
  usePathname();
  return navigate;
}

export function useRouter() {
  const pathname = usePathname();
  return {
    state: {
      matches: [{ params: paramsFromPathname(pathname) }],
    },
    navigate,
  };
}

export function useLocation<T>(options?: {
  readonly select?: (location: { pathname: string }) => T;
}): T | { pathname: string } {
  const location = { pathname: usePathname() };
  return options?.select ? options.select(location) : location;
}

export function useParams<T>(options?: {
  readonly select?: (params: Record<string, string>) => T;
}): T | Record<string, string> {
  const params = paramsFromPathname(usePathname());
  return options?.select ? options.select(params) : params;
}

export function Link({
  children,
  to = "/",
  params,
  onClick,
  ...props
}: {
  readonly children?: ReactNode;
  readonly to?: string;
  readonly params?: Record<string, string>;
  readonly onClick?: () => void;
  readonly [key: string]: unknown;
}) {
  return (
    <view
      {...props}
      bindtap={() => {
        onClick?.();
        navigateLynx(resolveTo({ to, params }));
      }}
    >
      {children}
    </view>
  );
}
