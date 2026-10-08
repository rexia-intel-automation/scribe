import js from "@eslint/js";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
export default tseslint.config(
  { ignores: ["ui/dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["ui/test/**/*.mjs"],
    languageOptions: {
      globals: Object.fromEntries(
        [
          "process",
          "console",
          "fetch",
          "performance",
          "setTimeout",
          "clearTimeout",
          "setImmediate",
          "document",
          "innerWidth",
          "innerHeight",
          "devicePixelRatio",
          "MutationObserver",
        ].map((name) => [name, "readonly"]),
      ),
    },
  },
  {
    files: ["ui/**/*.{ts,tsx}"],
    plugins: { "react-hooks": hooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
);
