import tailwindcss from "tailwindcss";

import { lynxTailwindCompatibility } from "./scripts/postcss-lynx-tailwind-compat.mjs";

export default {
  plugins: [tailwindcss(), lynxTailwindCompatibility()],
};
