import {
  ArrowRightIcon,
  ArrowUpIcon,
  CompassIcon,
  LaptopMinimalIcon,
  LightbulbIcon,
  MoonIcon,
  RocketIcon,
  SparklesIcon,
  SunIcon,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { cn } from "~/lib/utils";

type WelcomeWorkspaceProps = {
  readonly isDark: boolean;
  readonly onCreateProject: (prompt?: string) => void;
  readonly onExploreProjects: () => void;
  readonly onOpenConnections: () => void;
  readonly onToggleTheme: () => void;
};

const WORKFLOWS = [
  {
    id: "guide",
    eyebrow: "Create with confidence",
    title: "Guide my next build",
    description: "Turn a rough idea into a clear plan and a working first pass.",
    icon: LightbulbIcon,
    accent: "bg-amber-400/16 text-amber-700 dark:bg-amber-300/12 dark:text-amber-200",
  },
  {
    id: "explore",
    eyebrow: "Pick up where you left off",
    title: "Explore my projects",
    description: "Open a workspace, inspect the code, and decide what matters next.",
    icon: CompassIcon,
    accent: "bg-emerald-400/14 text-emerald-700 dark:bg-emerald-300/12 dark:text-emerald-200",
  },
  {
    id: "ship",
    eyebrow: "Move from idea to done",
    title: "Ship faster",
    description: "Pair planning, implementation, and review in one focused workflow.",
    icon: RocketIcon,
    accent: "bg-sky-400/14 text-sky-700 dark:bg-sky-300/12 dark:text-sky-200",
  },
] as const;

function WelcomeMark() {
  return (
    <div className="relative grid size-12 place-items-center text-foreground" aria-hidden="true">
      <div className="absolute inset-[9px] rotate-45 rounded-[9px] border-[3px] border-current" />
      <div className="absolute inset-[9px] rounded-[9px] border-[3px] border-current" />
      <div className="relative size-2.5 rounded-full bg-background ring-[3px] ring-foreground" />
    </div>
  );
}

function WorkflowCard({
  accent,
  description,
  eyebrow,
  icon: Icon,
  onClick,
  title,
}: {
  readonly accent: string;
  readonly description: string;
  readonly eyebrow: string;
  readonly icon: typeof LightbulbIcon;
  readonly onClick: () => void;
  readonly title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex min-h-50 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/78 p-5 text-left shadow-[0_1px_2px_rgba(20,24,36,0.04),0_14px_34px_rgba(20,24,36,0.06)] transition-[transform,border-color,box-shadow,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-border hover:bg-card hover:shadow-[0_2px_4px_rgba(20,24,36,0.05),0_20px_42px_rgba(20,24,36,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-card/52"
    >
      <div className={cn("grid size-11 place-items-center rounded-xl", accent)}>
        <Icon className="size-5" strokeWidth={1.8} />
      </div>
      <div className="mt-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-[17px] font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h2>
        <p className="mt-2 max-w-[28ch] text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <ArrowRightIcon className="absolute bottom-5 right-5 size-4 -translate-x-1 text-muted-foreground/45 opacity-0 transition-[transform,opacity] duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
    </button>
  );
}

function UtilityButton({
  children,
  onClick,
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-border/65 bg-background/70 px-3 text-xs font-medium text-muted-foreground shadow-sm/5 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

export function WelcomeWorkspace({
  isDark,
  onCreateProject,
  onExploreProjects,
  onOpenConnections,
  onToggleTheme,
}: WelcomeWorkspaceProps) {
  const [prompt, setPrompt] = useState("");

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    onCreateProject(trimmedPrompt || undefined);
  };

  return (
    <main className="relative isolate flex h-dvh min-h-0 flex-1 overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_8%,color-mix(in_oklab,var(--foreground)_3%,transparent),transparent_32%),linear-gradient(to_bottom,color-mix(in_oklab,var(--background)_92%,var(--muted)),var(--background)_58%)] dark:bg-[radial-gradient(circle_at_50%_4%,color-mix(in_oklab,var(--foreground)_7%,transparent),transparent_34%),linear-gradient(to_bottom,color-mix(in_oklab,var(--background)_88%,var(--muted)),var(--background)_62%)]" />

      <div className="absolute right-5 top-4 z-10 flex items-center gap-2">
        <UtilityButton onClick={onOpenConnections}>
          <LaptopMinimalIcon className="size-3.5" />
          <span className="hidden sm:inline">Work across devices</span>
        </UtilityButton>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          className="grid size-9 place-items-center rounded-full border border-border/65 bg-background/70 text-muted-foreground shadow-sm/5 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
        </button>
      </div>

      <div className="mx-auto flex h-full w-full max-w-[1120px] flex-col px-5 pb-5 pt-14 sm:px-8 sm:pb-8 lg:px-12">
        <section className="flex min-h-0 flex-1 flex-col items-center justify-center pb-7 pt-4 sm:pb-10">
          <WelcomeMark />
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60">
            T3 Code workspace
          </p>
          <h1 className="mt-2 text-balance text-center text-[clamp(2rem,4vw,3.55rem)] font-semibold leading-[1.04] tracking-[-0.045em]">
            What are you working on?
          </h1>
          <p className="mt-4 max-w-xl text-balance text-center text-sm leading-6 text-muted-foreground sm:text-[15px]">
            Start with an idea, return to a project, or connect another environment.
          </p>

          <div className="mt-10 grid w-full grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {WORKFLOWS.map((workflow) => (
              <WorkflowCard
                key={workflow.id}
                {...workflow}
                onClick={workflow.id === "explore" ? onExploreProjects : () => onCreateProject()}
              />
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-3xl shrink-0">
          <form
            onSubmit={submitPrompt}
            className="rounded-2xl border border-border/70 bg-background/88 p-2 shadow-[0_2px_5px_rgba(20,24,36,0.06),0_18px_55px_rgba(20,24,36,0.09)] backdrop-blur-xl dark:bg-card/68"
          >
            <label htmlFor="welcome-workspace-prompt" className="sr-only">
              What do you want to build?
            </label>
            <textarea
              id="welcome-workspace-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="What do you want to build?"
              rows={2}
              className="block max-h-36 min-h-16 w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <div className="flex items-center justify-between px-1 pb-1">
              <button
                type="button"
                onClick={onExploreProjects}
                className="inline-flex h-8 items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <SparklesIcon className="size-3.5" />
                Choose a project
              </button>
              <button
                type="submit"
                aria-label="Start building"
                className="grid size-8 place-items-center rounded-full bg-foreground text-background shadow-sm transition-[transform,opacity] hover:-translate-y-0.5 hover:opacity-88 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <ArrowUpIcon className="size-4" strokeWidth={2.3} />
              </button>
            </div>
          </form>
          <p className="mt-3 text-center text-[11px] text-muted-foreground/55">
            Add a project first, then T3 Code can plan and build with you.
          </p>
        </section>
      </div>
    </main>
  );
}
