// Builds the design system in ../../design-system from the admin's own
// sources: syncs the color tokens with src/index.css, bundles the components
// in COMPONENTS as window.ContentStudio and copies the font and logos.
//
//   npm run build:design-system          build
//   npm run build:design-system -- --check
//                                        fail when tokens.json or the
//                                        component folders are out of sync
import tailwindcss from "@tailwindcss/vite";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "vite";

const HERE = import.meta.dirname;
const FRONTEND = path.resolve(HERE, "..");
const REPO = path.resolve(FRONTEND, "..");
const DS = path.join(REPO, "design-system");
const CHECK = process.argv.includes("--check");

// Component folder name -> source file in src/components/ui. Every name has
// a folder in design-system/components with a README.md and a preview.html,
// and its exports in entry.tsx.
const COMPONENTS = {
  Button: "button",
  ButtonGroup: "button-group",
  Toggle: "toggle",
  ToggleGroup: "toggle-group",
  Input: "input",
  InputGroup: "input-group",
  DebouncedInput: "debounced-input",
  Textarea: "textarea",
  Label: "label",
  Select: "select",
  MultiSelect: "multi-select",
  TagInput: "tag-input",
  Checkbox: "checkbox",
  Switch: "switch",
  InputOTP: "input-otp",
  Calendar: "calendar",
  Form: "form",
  Badge: "badge",
  Avatar: "avatar",
  Separator: "separator",
  Spinner: "spinner",
  Table: "table",
  Tabs: "tabs",
  Pagination: "pagination",
  Command: "command",
  Dialog: "dialog",
  AlertDialog: "alert-dialog",
  Sheet: "sheet",
  Popover: "popover",
  Tooltip: "tooltip",
  DropdownMenu: "dropdown-menu",
  ContextMenu: "context-menu",
  Alert: "alert",
  Toaster: "sonner",
};
// Folders in design-system/components that are cards, not components.
const CARDS = ["Cover", "lib"];

const problems = [];

function cssBlock(css, selector) {
  const match = css.match(
    new RegExp(`\\n${selector}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  return Object.fromEntries(
    [...match[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1],
      // tokens.json writes alpha as a number: "/ 10%)" -> "/ 0.1)"
      m[2].trim().replace(/\/\s*(\d+)%\)/, (_, p) => `/ ${Number(p) / 100})`),
    ]),
  );
}

function gitRef() {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: REPO,
    });
    return `main@${sha.toString().trim()}`;
  } catch {
    return "main";
  }
}

// 1. Color tokens follow src/index.css; usage notes stay as written.
const tokensPath = path.join(DS, "tokens.json");
const tokens = JSON.parse(fs.readFileSync(tokensPath, "utf8"));
const css = fs.readFileSync(path.join(FRONTEND, "src/index.css"), "utf8");
const light = cssBlock(css, ":root");
const dark = cssBlock(css, "\\.dark");
const scale = cssBlock(css, "@theme inline");
const colorNames = new Set();
for (const token of tokens.color.tokens) {
  colorNames.add(token.name);
  // The mist scale is one value for both themes.
  const value =
    token.name in scale
      ? { light: scale[token.name] }
      : token.name in light
        ? {
            light: light[token.name],
            dark: dark[token.name] ?? light[token.name],
          }
        : null;
  if (!value) {
    problems.push(`tokens.json: color "${token.name}" is not in index.css`);
    continue;
  }
  if (JSON.stringify(value) !== JSON.stringify(token.value)) {
    if (CHECK)
      problems.push(
        `tokens.json: color "${token.name}" differs from index.css`,
      );
    token.value = value;
  }
}
for (const name of Object.keys(light)) {
  if (name !== "radius" && !colorNames.has(name)) {
    problems.push(`tokens.json: index.css variable "--${name}" has no token`);
  }
}

// 2. Component folders match COMPONENTS.
const componentsDir = path.join(DS, "components");
const folders = fs
  .readdirSync(componentsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !CARDS.includes(d.name))
  .map((d) => d.name);
for (const name of folders) {
  if (!(name in COMPONENTS))
    problems.push(`components/${name}: not in COMPONENTS`);
}
const entry = fs.readFileSync(path.join(HERE, "entry.tsx"), "utf8");
for (const [name, file] of Object.entries(COMPONENTS)) {
  for (const doc of ["README.md", "preview.html"]) {
    if (!fs.existsSync(path.join(componentsDir, name, doc))) {
      problems.push(`components/${name}/${doc} is missing`);
    }
  }
  if (!entry.includes(`"@/components/ui/${file}"`)) {
    problems.push(
      `entry.tsx does not export ${name} (src/components/ui/${file}.tsx)`,
    );
  }
}

if (problems.length) {
  console.error(problems.map((p) => `- ${p}`).join("\n"));
  process.exit(1);
}
if (CHECK) process.exit(0);

tokens.meta.ref = gitRef();
tokens.meta.synced = new Date().toISOString().slice(0, 10);
tokens.meta.components = Object.fromEntries(
  Object.entries(COMPONENTS).map(([name, file]) => [
    name,
    `frontend/src/components/ui/${file}.tsx`,
  ]),
);
fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2) + "\n");

// 3. Bundle the components over the page's React 18 (components/lib).
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-studio-ds-"));
const shim = (file) => path.join(HERE, "shims", file);
await build({
  configFile: false,
  root: FRONTEND,
  logLevel: "warn",
  plugins: [tailwindcss()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  resolve: {
    alias: [
      { find: /^react\/jsx-runtime$/, replacement: shim("jsx-runtime.js") },
      { find: /^react-dom\/client$/, replacement: shim("react-dom.js") },
      { find: /^react-dom$/, replacement: shim("react-dom.js") },
      { find: /^react$/, replacement: shim("react.js") },
      { find: "@", replacement: path.join(FRONTEND, "src") },
    ],
  },
  build: {
    outDir,
    emptyOutDir: true,
    minify: true,
    cssCodeSplit: false,
    rollupOptions: {
      // The "use client" directives of the Radix packages mean nothing here.
      onwarn(warning, warn) {
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
      },
    },
    lib: {
      entry: path.join(HERE, "entry.tsx"),
      name: "ContentStudio",
      formats: ["iife"],
      fileName: () => "bundle.js",
      cssFileName: "bundle",
    },
  },
});

// 4. The styles leave the theme values to tokens.json, and the dark variant
// follows the design system's data-theme instead of the admin's .dark class.
const tokenNames = new Set(["font-sans"]);
for (const family of ["color", "spacing", "radius", "shadow"]) {
  for (const token of tokens[family].tokens) tokenNames.add(token.name);
}
let bundleCss = fs.readFileSync(path.join(outDir, "bundle.css"), "utf8");
bundleCss = bundleCss
  .replace(/(?<=[}\s]):root\{--background:[^{}]*\}/g, "")
  .replace(/\.dark\{--background:[^{}]*\}/g, "")
  .replace(/(:root,:host)\{([^{}]*)\}/g, (_, selector, body) => {
    const keep = body
      .split(";")
      .filter((decl) => decl.trim())
      .filter((decl) => {
        const name = decl.trim().match(/^--([\w-]+)\s*:/)?.[1];
        return !name || !tokenNames.has(name);
      });
    return `${selector}{${keep.join(";")}}`;
  })
  .replaceAll(":is(.dark *)", ':is([data-theme="dark"] *)');
const leftover = [...tokenNames].filter((name) =>
  new RegExp(`--${name}\\s*:`).test(bundleCss),
);
if (leftover.length)
  throw new Error(`bundle.css still sets ${leftover.join(", ")}`);
fs.writeFileSync(
  path.join(componentsDir, "bundle.css"),
  "/* Django Content Studio admin styles (Tailwind build of frontend/src/index.css); theme values come from tokens.json. */\n" +
    bundleCss,
);

const bundleJs = fs.readFileSync(path.join(outDir, "bundle.js"), "utf8");
if (bundleJs.includes("</script") || bundleJs.includes("<!--")) {
  throw new Error("bundle.js contains </script or <!--");
}
const header = {
  format: 4,
  namespace: "ContentStudio",
  components: Object.keys(COMPONENTS).map((name) => ({ name })),
};
fs.writeFileSync(
  path.join(componentsDir, "bundle.js"),
  `/* @ds-bundle: ${JSON.stringify(header)} */\n${bundleJs}`,
);
fs.rmSync(outDir, { recursive: true, force: true });

// 5. Font and logos.
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};
copy(
  path.join(FRONTEND, "public/fonts/inter/inter-latin-wght-normal.woff2"),
  path.join(DS, "fonts/inter-latin-wght-normal.woff2"),
);
copy(
  path.join(FRONTEND, "public/img/icon.svg"),
  path.join(DS, "assets/Logos/content-studio-icon.svg"),
);
copy(
  path.join(FRONTEND, "public/img/icon.png"),
  path.join(DS, "assets/Logos/content-studio-icon.png"),
);

console.log(
  `Design system built: ${Object.keys(COMPONENTS).length} components, ${tokens.color.tokens.length} colors.`,
);
