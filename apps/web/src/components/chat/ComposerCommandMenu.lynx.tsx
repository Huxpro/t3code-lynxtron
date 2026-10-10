import type {
  ProjectEntry,
  ProviderDriverKind,
  PullRequestContextMetadata,
  ServerProviderSkill,
  ServerProviderSlashCommand,
} from "@t3tools/contracts";

import type { ComposerSlashCommand } from "../../composer-logic";

// The Web module is the DOM command menu. Lynx renders its own menu in the
// composer and takes only the item model, which upstream's slash-command
// search is typed against.
export type ComposerCommandItem =
  | {
      id: string;
      type: "path";
      path: string;
      pathKind: ProjectEntry["kind"];
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "slash-command";
      command: ComposerSlashCommand;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "provider-slash-command";
      provider: ProviderDriverKind;
      command: ServerProviderSlashCommand;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "skill";
      provider: ProviderDriverKind;
      skill: ServerProviderSkill;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "pull-request";
      pullRequest: PullRequestContextMetadata;
      label: string;
      description: string;
    };
