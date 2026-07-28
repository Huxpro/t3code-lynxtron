export interface SeparatorProps {
  readonly className?: string;
  readonly orientation?: "horizontal" | "vertical";
}

export function Separator({ className, orientation = "horizontal" }: SeparatorProps) {
  return (
    <view
      className={["ui-separator", `ui-separator--${orientation}`, className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
