import { HostHeading } from "../ui/hostElements";

export function ChatHeaderTitle({
  title,
  className,
}: {
  readonly title: string;
  readonly className: string;
}) {
  return (
    <HostHeading aria-label={title} className={className} title={title}>
      {title}
    </HostHeading>
  );
}
