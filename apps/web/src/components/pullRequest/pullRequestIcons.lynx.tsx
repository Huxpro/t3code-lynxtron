import { GitPullRequestIcon } from "lucide-react";

// Lynx has no pull request screens; the sidebar link is the only glyph drawn.
export const PullRequestGlyph = {
  pullRequest: GitPullRequestIcon,
} as const;
