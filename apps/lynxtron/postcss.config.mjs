import tailwindcss from "tailwindcss";

import { lynxTailwindCompatibility } from "./scripts/postcss-lynx-tailwind-compat.mjs";
import { lynxTextCarry } from "./scripts/postcss-lynx-text-carry.mjs";

export default {
  plugins: [tailwindcss(), lynxTailwindCompatibility(), lynxTextCarry()],
};
