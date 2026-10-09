/**
 * Renderer-neutral transcript row presentation helpers.
 *
 * Moved verbatim out of Web's `MessagesTimeline.tsx` so Web and Lynx compile
 * the same work-row anatomy decisions (heading, preview, expanded body, icon
 * intent) from one physical module. Pure functions only; rendering lives in
 * `TranscriptRowSurface.tsx` and its platform element leaves.
 */
import {
  normalizeCompactToolLabel,
  toolGroupAction,
  type MessagesTimelineRow,
  type ToolGroupSummaryKind,
} from "@t3tools/lynx-logic/transcript";
import { formatWorkspaceRelativePath } from "@t3tools/lynx-logic/paths";

export type TimelineWorkEntry = Extract<
  MessagesTimelineRow,
  { kind: "work" }
>["groupedEntries"][number];

export type WorkEntryIconName =
  | "bot"
  | "check"
  | "circle-alert"
  | "eye"
  | "globe"
  | "hammer"
  | "message-circle"
  | "search"
  | "square-pen"
  | "terminal"
  | "wrench"
  | "x"
  | "zap";

export interface WorkToneIcon {
  readonly iconName: WorkEntryIconName;
  readonly className: string;
}

export function workToneIcon(tone: TimelineWorkEntry["tone"]): WorkToneIcon {
  if (tone === "error") {
    return {
      iconName: "circle-alert",
      className: "text-foreground/92",
    };
  }
  if (tone === "thinking") {
    return {
      iconName: "bot",
      className: "text-foreground/92",
    };
  }
  if (tone === "info") {
    return {
      iconName: "check",
      className: "text-muted-foreground",
    };
  }
  return {
    iconName: "zap",
    className: "text-foreground/92",
  };
}

export function workEntryPreview(
  workEntry: Pick<TimelineWorkEntry, "detail" | "command" | "changedFiles">,
  workspaceRoot: string | undefined,
): string | null {
  if (workEntry.command) return workEntry.command;
  if (workEntry.detail) return workEntry.detail;
  if ((workEntry.changedFiles?.length ?? 0) === 0) return null;
  const [firstPath] = workEntry.changedFiles ?? [];
  if (!firstPath) return null;
  const displayPath = formatWorkspaceRelativePath(firstPath, workspaceRoot);
  return workEntry.changedFiles!.length === 1
    ? displayPath
    : `${displayPath} +${workEntry.changedFiles!.length - 1} more`;
}

export function workEntryRawCommand(
  workEntry: Pick<TimelineWorkEntry, "command" | "rawCommand">,
): string | null {
  const rawCommand = workEntry.rawCommand?.trim();
  if (!rawCommand || !workEntry.command) {
    return null;
  }
  return rawCommand === workEntry.command.trim() ? null : rawCommand;
}

export function buildToolCallExpandedBody(
  workEntry: TimelineWorkEntry,
  workspaceRoot: string | undefined,
): string | null {
  const blocks: string[] = [];
  if (workEntry.itemType === "mcp_tool_call" && workEntry.toolData !== undefined) {
    blocks.push(`MCP call\n${JSON.stringify(workEntry.toolData, null, 2)}`);
  }
  const raw = workEntryRawCommand(workEntry);
  if (raw?.trim()) {
    blocks.push(raw.trim());
  } else if (workEntry.command?.trim()) {
    blocks.push(workEntry.command.trim());
  }
  if (workEntry.detail?.trim()) {
    blocks.push(workEntry.detail.trim());
  }
  const changedFiles = workEntry.changedFiles ?? [];
  if (changedFiles.length > 0) {
    blocks.push(
      changedFiles
        .map((filePath) => formatWorkspaceRelativePath(filePath, workspaceRoot))
        .join("\n"),
    );
  }
  return blocks.length > 0 ? blocks.join("\n\n") : null;
}

export function workEntryIconName(workEntry: TimelineWorkEntry): WorkEntryIconName {
  if (
    workEntry.sourceActivityKind === "user-input.requested" ||
    workEntry.sourceActivityKind === "user-input.resolved"
  ) {
    return "message-circle";
  }
  const action = toolGroupAction(workEntry);
  if (action !== "other") return toolGroupSummaryIconName(action);

  switch (workEntry.itemType) {
    case "mcp_tool_call":
      return "wrench";
    case "dynamic_tool_call":
    case "collab_agent_tool_call":
      return "hammer";
  }

  return workToneIcon(workEntry.tone).iconName;
}

export function capitalizePhrase(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return value;
  }
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

export function toolWorkEntryHeading(workEntry: TimelineWorkEntry): string {
  if (!workEntry.toolTitle) {
    return capitalizePhrase(normalizeCompactToolLabel(workEntry.label));
  }
  return capitalizePhrase(normalizeCompactToolLabel(workEntry.toolTitle));
}

/** Label noun used by the collapsed work-group toggle row. */
export function workGroupToggleNoun(input: {
  readonly onlyToolEntries: boolean;
  readonly hiddenCount: number;
}): string {
  return input.onlyToolEntries
    ? input.hiddenCount === 1
      ? "tool call"
      : "tool calls"
    : input.hiddenCount === 1
      ? "log entry"
      : "log entries";
}

/** Accessible label for a collapsed work group section. */
export function workGroupSectionLabel(input: {
  readonly onlyToolEntries: boolean;
  readonly entryCount: number;
}): string {
  if (!input.onlyToolEntries) return "Work Log";
  return input.entryCount === 1 ? "1 tool call" : `${input.entryCount} tool calls`;
}

/** Leading icon for a one-line tool-group summary row. */
export function toolGroupSummaryIconName(kind: ToolGroupSummaryKind | null): WorkEntryIconName {
  switch (kind) {
    case "read":
      return "eye";
    case "edit":
      return "square-pen";
    case "command":
      return "terminal";
    case "search":
      return "globe";
    case "code-search":
      return "search";
    case "other":
      return "wrench";
    case "dynamic-tool":
      return "hammer";
    case "agent-tool":
      return "bot";
    case "tone-tool":
      return "zap";
    case "mixed":
    case null:
      return "hammer";
  }
}

type CommandWrapper = "env" | "sudo";

const COMMAND_WRAPPER_OPTIONS_WITH_VALUE: Record<CommandWrapper, ReadonlySet<string>> = {
  env: new Set(["-C", "--chdir", "-S", "--split-string", "-u", "--unset"]),
  sudo: new Set(["-C", "--close-from", "-D", "--chdir", "-g", "--group", "-u", "--user"]),
};

const COMMAND_WRAPPER_FLAGS: Record<CommandWrapper, ReadonlySet<string>> = {
  env: new Set(["-0", "--null", "-i", "--ignore-environment", "--debug", "-v"]),
  sudo: new Set(["-A", "--askpass", "-b", "--background", "-E", "-H", "-i", "-n", "-S"]),
};

function tokenizeShellCommand(command: string): string[] | null {
  const input = command.trim();
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;
  let substitutionDepth = 0;
  let tokenStarted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (escaping) {
      current += character;
      escaping = false;
      tokenStarted = true;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      const nextCharacter = input[index + 1];
      const isWindowsDrivePath = quote === null && /^[A-Za-z]:/.test(current);
      if (
        (quote === '"' || isWindowsDrivePath) &&
        nextCharacter !== undefined &&
        nextCharacter !== '"' &&
        nextCharacter !== "\\" &&
        nextCharacter !== "$" &&
        nextCharacter !== "`" &&
        nextCharacter !== "\n"
      ) {
        current += character;
        tokenStarted = true;
        continue;
      }
      escaping = true;
      tokenStarted = true;
      continue;
    }
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      tokenStarted = true;
      continue;
    }
    if (character === "$" && input[index + 1] === "(") {
      current += "$(";
      substitutionDepth += 1;
      tokenStarted = true;
      index += 1;
      continue;
    }
    if (character === ")" && substitutionDepth > 0) {
      current += character;
      substitutionDepth -= 1;
      tokenStarted = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      tokenStarted = true;
      continue;
    }
    if (/\s/u.test(character)) {
      if (substitutionDepth > 0) {
        current += character;
        tokenStarted = true;
        continue;
      }
      if (tokenStarted) {
        tokens.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }
    current += character;
    tokenStarted = true;
  }

  if (quote !== null || escaping || substitutionDepth > 0) return null;
  if (tokenStarted) tokens.push(current);
  return tokens;
}

export function commandProgramName(command: string, depth = 0): string | null {
  if (depth >= 8) return null;
  const tokens = tokenizeShellCommand(command);
  if (tokens === null) return null;
  let index = 0;
  let wrapper: CommandWrapper | null = null;

  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) return null;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      index += 1;
      continue;
    }
    const tokenProgram = token.split(/[\\/]/).at(-1);
    if (tokenProgram === "env" || tokenProgram === "sudo") {
      wrapper = tokenProgram;
      index += 1;
      continue;
    }
    if (wrapper !== null && token === "--") {
      wrapper = null;
      index += 1;
      continue;
    }
    if (wrapper !== null && token.startsWith("-")) {
      if (wrapper === "env" && (token === "-S" || token === "--split-string")) {
        const splitCommand = tokens[index + 1];
        return splitCommand ? commandProgramName(splitCommand, depth + 1) : null;
      }
      if (wrapper === "env" && token.startsWith("--split-string=")) {
        return commandProgramName(token.slice("--split-string=".length), depth + 1);
      }
      if (COMMAND_WRAPPER_OPTIONS_WITH_VALUE[wrapper].has(token)) {
        if (tokens[index + 1] === undefined) return null;
        index += 2;
        continue;
      }
      if (COMMAND_WRAPPER_FLAGS[wrapper].has(token)) {
        index += 1;
        continue;
      }
      const equalsIndex = token.indexOf("=");
      if (token.startsWith("--") && equalsIndex > 2) {
        if (!COMMAND_WRAPPER_OPTIONS_WITH_VALUE[wrapper].has(token.slice(0, equalsIndex))) {
          return null;
        }
        index += 1;
        continue;
      }
      if (/^-[A-Za-z].+/.test(token) && !token.startsWith("--")) {
        let consumesNextToken = false;
        for (const [optionIndex, option] of token.slice(1).split("").entries()) {
          const shortOption = `-${option}`;
          if (COMMAND_WRAPPER_OPTIONS_WITH_VALUE[wrapper].has(shortOption)) {
            consumesNextToken = optionIndex === token.length - 2;
            break;
          }
          if (!COMMAND_WRAPPER_FLAGS[wrapper].has(shortOption)) return null;
        }
        if (consumesNextToken && tokens[index + 1] === undefined) return null;
        index += consumesNextToken ? 2 : 1;
        continue;
      }
      return null;
    }
    return token.split(/[\\/]/).at(-1) || null;
  }

  return null;
}

/** Live-row copy for the running tool call ("Running pnpm"). */
export function liveWorkEntryLabel(
  workEntry: TimelineWorkEntry,
  workspaceRoot: string | undefined,
): string {
  const command = workEntry.command?.trim();
  if (command) {
    // This row describes the active parent turn, not the command lifecycle.
    // Keep its live "Running" copy until the turn or contiguous tool run settles.
    const program = commandProgramName(command);
    if (program) return `Running ${program}`;
    return "Running command";
  }

  return workEntryPreview(workEntry, workspaceRoot) ?? toolWorkEntryHeading(workEntry);
}
