import {
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
} from "@lynx-js/react";

type ElementProps = Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly render?: ReactElement<Record<string, unknown>>;
};

const TooltipContext = createContext(false);

export const TooltipCreateHandle = () => ({});

export function TooltipProvider({ children }: ElementProps) {
  return <>{children}</>;
}

export function Tooltip({ children }: ElementProps) {
  return <TooltipContext.Provider value={false}>{children}</TooltipContext.Provider>;
}

export function TooltipTrigger({ children, render, ...props }: ElementProps) {
  if (isValidElement(render)) {
    return cloneElement(render, { ...props, children });
  }
  return <view {...props}>{children}</view>;
}

export function TooltipPopup({
  children,
  hidden = false,
  ...props
}: ElementProps & {
  readonly hidden?: boolean;
}) {
  const open = useContext(TooltipContext);
  if (!open || hidden) return null;
  return <view {...props}>{children}</view>;
}
