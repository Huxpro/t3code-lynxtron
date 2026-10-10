// Lynx draws text only inside <text>, so a DOM box that holds a string becomes
// a <view> around a <text> (`src/app/platform/hostDom.tsx`). The engine hands
// colour, font family, font size and line height from the view to that text.
// It does not hand over the properties below, which the DOM inherits: a view's
// font weight was seen not to reach its text (keycaps, 2026-10-10), and
// white-space only takes effect on a <text>.
//
// Custom properties do inherit, so every declaration of one of these
// properties also states its value as a custom property, and the wrapped text
// reads it back (`.lynx-box-text` in `src/app/overrides.css`). The text then
// takes whatever the cascade settled on for its box, including a consumer's
// semantic class that overrides a component's utility class.
//
// Only properties the DOM inherits belong here: a custom property reaches every
// descendant. `text-overflow` is not inherited, so a box that truncates its own
// string still needs the class on a text element.
export const CARRIED_TEXT_PROPERTIES = ["font-weight", "white-space"];

export function carriedTextVariable(property) {
  return `--lynx-text-${property}`;
}

const CARRIED = new Set(CARRIED_TEXT_PROPERTIES);

/** The custom property a declaration is also stated as, or null when it has none. */
export function carriedDeclaration(property, value) {
  if (!CARRIED.has(property)) return null;
  const variable = carriedTextVariable(property);
  // `inherit` already follows the variable, and the rule that reads the
  // variable back must not define it.
  if (value.trim() === "inherit" || value.includes(variable)) return null;
  return { prop: variable, value };
}

export function lynxTextCarry() {
  return {
    postcssPlugin: "t3code-lynx-text-carry",
    Declaration(declaration) {
      const carried = carriedDeclaration(declaration.prop, declaration.value);
      if (carried === null) return;
      const next = declaration.next();
      if (next?.type === "decl" && next.prop === carried.prop) return;
      declaration.cloneAfter(carried);
    },
  };
}
