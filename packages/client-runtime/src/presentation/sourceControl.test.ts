import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

import {
  projectSourceControlDiscovery,
  projectSourceControlDiscoveryItem,
  redactSourceControlAccount,
  SOURCE_CONTROL_WRITING_STYLE_OPTIONS,
  sourceControlSummaryText,
} from "./sourceControl.ts";

describe("source-control discovery presentation", () => {
  it("redacts account copy deterministically across renderers", () => {
    expect(redactSourceControlAccount("Huxpro")).toBe("nhxjrr");
  });

  it("projects ready and unimplemented VCS rows", () => {
    const ready = projectSourceControlDiscoveryItem({
      kind: "git",
      label: "Git",
      executable: "git",
      status: "available",
      version: Option.some("2.50.0"),
      installHint: "Install Git.",
      detail: Option.none(),
      implemented: true,
    });
    const comingSoon = projectSourceControlDiscoveryItem({
      kind: "jj",
      label: "Jujutsu",
      executable: "jj",
      status: "available",
      version: Option.none(),
      installHint: "Install Jujutsu.",
      detail: Option.none(),
      implemented: false,
    });

    expect(ready).toMatchObject({
      section: "vcs",
      kind: "git",
      statusTone: "success",
      enabled: true,
      badgeLabel: null,
      version: "2.50.0",
    });
    expect(sourceControlSummaryText(ready)).toBe("Available");
    expect(comingSoon).toMatchObject({
      section: "vcs",
      kind: "jj",
      statusTone: "muted",
      enabled: false,
      badgeLabel: "Coming Soon",
    });
  });

  it("keeps authenticated accounts as sensitive summary parts", () => {
    const presentation = projectSourceControlDiscoveryItem({
      kind: "github",
      label: "GitHub",
      executable: "gh",
      status: "available",
      version: Option.some("2.75.0"),
      installHint: "Install GitHub CLI.",
      detail: Option.none(),
      auth: {
        status: "authenticated",
        account: Option.some("octocat"),
        host: Option.some("github.com"),
        detail: Option.none(),
      },
    });

    expect(presentation).toMatchObject({
      section: "provider",
      statusTone: "success",
      enabled: true,
      badgeLabel: null,
    });
    expect(sourceControlSummaryText(presentation)).toBe("Authenticated");
    expect(sourceControlSummaryText(presentation, { includeSensitive: true })).toBe(
      "Authenticated as octocat",
    );
  });

  it("preserves versions and accounts after a JSON transport round trip", () => {
    const wireItem = JSON.parse(
      JSON.stringify({
        kind: "github",
        label: "GitHub",
        executable: "gh",
        status: "available",
        version: Option.some("2.96.0"),
        installHint: "Install GitHub CLI.",
        detail: Option.none(),
        auth: {
          status: "authenticated",
          account: Option.some("octocat"),
          host: Option.some("github.com"),
          detail: Option.none(),
        },
      }),
    );
    const presentation = projectSourceControlDiscoveryItem(wireItem);

    expect(presentation.version).toBe("2.96.0");
    expect(sourceControlSummaryText(presentation, { includeSensitive: true })).toBe(
      "Authenticated as octocat",
    );
  });

  it("preserves Effect RPC option wire values without runtime tags", () => {
    const presentation = projectSourceControlDiscoveryItem({
      kind: "github",
      label: "GitHub",
      executable: "gh",
      status: "available",
      version: { value: "2.96.0" },
      installHint: "Install GitHub CLI.",
      detail: {},
      auth: {
        status: "authenticated",
        account: { value: "octocat" },
        host: { value: "github.com" },
        detail: {},
      },
    } as never);

    expect(presentation.version).toBe("2.96.0");
    expect(sourceControlSummaryText(presentation, { includeSensitive: true })).toBe(
      "Authenticated as octocat",
    );
  });

  it("projects unauthenticated provider guidance with code semantics", () => {
    const presentation = projectSourceControlDiscoveryItem({
      kind: "gitlab",
      label: "GitLab",
      executable: "glab",
      status: "available",
      version: Option.none(),
      installHint: "Install GitLab CLI.",
      detail: Option.none(),
      auth: {
        status: "unauthenticated",
        account: Option.none(),
        host: Option.none(),
        detail: Option.none(),
      },
    });

    expect(presentation).toMatchObject({
      statusTone: "warning",
      enabled: false,
      badgeLabel: "Not authenticated",
    });
    expect(presentation.summaryParts.map((part) => part.kind)).toEqual(["text", "code", "text"]);
    expect(sourceControlSummaryText(presentation)).toContain("glab");
  });

  it("groups canonical discovery sections", () => {
    const result = projectSourceControlDiscovery({
      versionControlSystems: [
        {
          kind: "git",
          label: "Git",
          executable: "git",
          status: "available",
          version: Option.none(),
          installHint: "Install Git.",
          detail: Option.none(),
          implemented: true,
        },
      ],
      sourceControlProviders: [],
    });

    expect(result.hasItems).toBe(true);
    expect(result.versionControlSystems).toHaveLength(1);
    expect(result.sourceControlProviders).toHaveLength(0);
  });

  it("shares source-control writing style copy across renderers", () => {
    expect(SOURCE_CONTROL_WRITING_STYLE_OPTIONS).toEqual({
      repo_conventions: {
        label: "Repository conventions",
        description:
          "In each project, matches recent change descriptions and change request titles.",
      },
      conventional_commits: {
        label: "Conventional Commits",
        description:
          "Uses Conventional Commit prefixes for change descriptions; change request titles and descriptions stay concise.",
      },
      custom: {
        label: "Custom instructions",
        description:
          "Applies your instructions to change descriptions and change request titles and descriptions in every project.",
      },
    });
  });
});
