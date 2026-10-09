import { projectFileIconPresentation } from "@t3tools/lynx-logic/files";

export function ProjectFileIcon({ path }: { readonly path: string }) {
  const presentation = projectFileIconPresentation(path);
  return (
    <view
      className={`project-file-icon project-file-icon--${presentation.tone}`}
      data-file-icon-tone={presentation.tone}
    >
      <text className="project-file-icon__label">{presentation.label}</text>
    </view>
  );
}
