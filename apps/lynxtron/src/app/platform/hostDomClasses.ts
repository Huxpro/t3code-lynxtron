// Which of a DOM element's classes also have to sit on the `<text>` that draws
// its bare text children. On the Web a `<div className="font-medium">Save</div>`
// styles its text by inheritance; a Lynx `<view>` does not hand font weight to
// the `<text>` inside it, so `platform/hostDom` repeats the text-affecting
// classes on that `<text>`. The box keeps every class it was given.

// Font weight and family, text size, colour and alignment, leading, tracking,
// truncation and wrapping, and the text style keywords.
const TEXT_UTILITY =
  /^(?:(?:font|text|leading|tracking|line-clamp|whitespace)-.+|truncate|italic|not-italic|uppercase|lowercase|capitalize|normal-case|underline|line-through|no-underline)$/u;

// Variants whose condition is true for the text exactly when it is true for the
// box: media and container queries, the theme, and the state of an ancestor.
// `hover:`, `data-[...]:`, `aria-*:` and the like describe the box itself, which
// the `<text>` is not, so a class behind one of them stays on the box only.
const SHARED_VARIANT = /^(?:sm|md|lg|xl|2xl|dark|(?:min|max|group|in)-.+|@.+)$/u;

/** Splits `md:group-data-[x=y]:text-sm` into its variants and its utility. */
function splitVariants(className: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < className.length; index += 1) {
    const character = className[index];
    if (character === "[" || character === "(") depth += 1;
    else if (character === "]" || character === ")") depth -= 1;
    else if (character === ":" && depth === 0) {
      parts.push(className.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(className.slice(start));
  return parts;
}

function isTextClass(className: string): boolean {
  const parts = splitVariants(className);
  const utility = (parts.pop() ?? "").replace(/^[!-]+|!$/gu, "");
  return TEXT_UTILITY.test(utility) && parts.every((variant) => SHARED_VARIANT.test(variant));
}

/** The classes of `className` that style text, in the order they were written. */
export function textClassName(className: unknown): string {
  if (typeof className !== "string" || className.length === 0) return "";
  return className
    .split(/\s+/u)
    .filter((name) => name.length > 0 && isTextClass(name))
    .join(" ");
}
