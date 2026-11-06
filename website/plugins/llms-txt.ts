// Writes the docs for AI agents into the build, next to the pages:
//
// - /llms.txt: an index of the docs, following https://llmstxt.org;
// - /llms-full.txt: every docs page in one Markdown file;
// - /docs/<page>.md: each docs page as Markdown;
// - /skills/: the agent skills in website/skills, as they are.
//
// The Markdown comes from the docs' own source, in sidebar order, so it
// cannot drift from the pages. MDX components (screenshots) are left out,
// admonitions become block quotes and links become absolute.
import fs from "node:fs/promises";
import path from "node:path";
import type { LoadContext, Plugin } from "@docusaurus/types";

export type LlmsTxtOptions = {
  // The summary under the title of llms.txt and llms-full.txt.
  summary: string;
  // Paragraphs after the summary of llms.txt.
  details: string[];
  // The sidebar's doc IDs, in order.
  docs: string[];
  // Doc IDs listed under "Optional" in llms.txt.
  optional: string[];
  // The folder with the agent skills, relative to the site.
  skillsDir: string;
};

type Page = {
  id: string;
  title: string;
  description: string;
  markdown: string;
};

const FENCE = /^\s*(```|~~~)/;
const ADMONITION_START = /^:::(note|tip|info|caution|warning|danger)\b\s*(.*)$/;
// A leading emoji (with variation selectors and joiners) in a page title.
const LEADING_EMOJI = /^(?:[\p{Extended_Pictographic}\u{FE0F}\u{200D}]+\s*)+/u;

export function mdxToMarkdown(source: string, siteUrl: string): string {
  const lines = source.split("\n");
  const out: string[] = [];
  let inFence = false;
  let inComponent = false;
  let inAdmonition = false;

  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      out.push(inAdmonition ? `> ${line}` : line);
      continue;
    }
    if (inFence) {
      out.push(inAdmonition ? `> ${line}` : line);
      continue;
    }

    // MDX components, such as <Screenshot ... />, on one or more lines.
    if (inComponent || /^\s*<[A-Z]/.test(line)) {
      inComponent = !/\/>\s*$|<\/[A-Z]\w*>\s*$/.test(line);
      continue;
    }
    if (
      /^import .+ from ["']/.test(line) ||
      /^export (const|default|function) /.test(line)
    ) {
      continue;
    }

    const admonition = line.match(ADMONITION_START);
    if (admonition) {
      const kind = admonition[1][0].toUpperCase() + admonition[1].slice(1);
      const title = admonition[2].trim();
      out.push(`> **${title || kind}**`, ">");
      inAdmonition = true;
      continue;
    }
    if (inAdmonition && /^:::\s*$/.test(line)) {
      inAdmonition = false;
      continue;
    }

    let text = line
      // Explicit heading IDs: "### ADMIN_SITE {#admin_site}".
      .replace(/^(#{1,6} .*?)\s*\{#[\w-]+\}\s*$/, "$1")
      // Site links become absolute; docs links point at the Markdown.
      .replace(
        /\]\(\/docs\/([\w-]+)(#[\w-]+)?\)/g,
        (_, id, hash = "") => `](${siteUrl}/docs/${id}.md${hash})`,
      )
      .replace(/\]\((?:pathname:\/\/)?\/(?!\/)/g, `](${siteUrl}/`);

    if (/^# /.test(text)) {
      text = `# ${text.slice(2).replace(LEADING_EMOJI, "")}`;
    }

    out.push(inAdmonition ? (text ? `> ${text}` : ">") : text);
  }

  return `${out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

// The page's first paragraph, on one line and without links.
function firstParagraph(markdown: string): string {
  const paragraph: string[] = [];

  for (const line of markdown.split("\n").slice(1)) {
    if (!line.trim()) {
      if (paragraph.length) break;
      continue;
    }
    if (/^(#|>|```|- |\| )/.test(line)) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(line.trim());
  }

  return paragraph
    .join(" ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
}

async function copyDir(from: string, to: string): Promise<void> {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDir(source, target);
    } else {
      await fs.copyFile(source, target);
    }
  }
}

async function findSkills(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const skills: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        await fs.access(path.join(dir, entry.name, "SKILL.md"));
        skills.push(entry.name);
      } catch {
        // Not a skill.
      }
    }
    return skills.sort();
  } catch {
    return [];
  }
}

export default function llmsTxtPlugin(
  context: LoadContext,
  pluginOptions: unknown,
): Plugin {
  const options = pluginOptions as LlmsTxtOptions;
  const { siteDir, siteConfig } = context;
  const siteUrl = `${siteConfig.url}${siteConfig.baseUrl}`.replace(/\/$/, "");
  const docsDir = path.join(siteDir, "docs");
  const skillsDir = path.join(siteDir, options.skillsDir);

  return {
    name: "llms-txt",

    getPathsToWatch() {
      return [path.join(skillsDir, "**/*")];
    },

    async postBuild({ outDir }) {
      const pages: Page[] = [];

      for (const id of options.docs) {
        const source = await fs.readFile(
          path.join(docsDir, `${id}.mdx`),
          "utf8",
        );
        const markdown = mdxToMarkdown(source, siteUrl);
        const title = markdown.split("\n")[0].replace(/^# /, "");
        pages.push({
          id,
          title,
          description: firstParagraph(markdown),
          markdown,
        });
      }

      for (const page of pages) {
        const file = path.join(outDir, "docs", `${page.id}.md`);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, page.markdown);
      }

      const skills = await findSkills(skillsDir);
      if (skills.length) {
        await copyDir(skillsDir, path.join(outDir, options.skillsDir));
      }

      const link = (page: Page) =>
        `- [${page.title}](${siteUrl}/docs/${page.id}.md): ${page.description}`;
      const main = pages.filter((page) => !options.optional.includes(page.id));
      const optional = pages.filter((page) =>
        options.optional.includes(page.id),
      );
      const title = siteConfig.title;

      const index = [
        `# ${title}`,
        `> ${options.summary}`,
        ...options.details,
        [
          `- [Full documentation](${siteUrl}/llms-full.txt): every page below in one file.`,
          ...skills.map(
            (name) =>
              `- [Agent skill](${siteUrl}/${options.skillsDir}/${name}/SKILL.md): ` +
              "how to set up and configure Content Studio, its main APIs and common mistakes.",
          ),
        ].join("\n"),
        `## Docs\n\n${main.map(link).join("\n")}`,
        optional.length
          ? `## Optional\n\n${optional.map(link).join("\n")}`
          : "",
      ].filter(Boolean);
      await fs.writeFile(
        path.join(outDir, "llms.txt"),
        `${index.join("\n\n")}\n`,
      );

      const full = [
        `# ${title}\n\n> ${options.summary}`,
        ...pages.map(
          (page) =>
            `${page.markdown.trim()}\n\nSource: ${siteUrl}/docs/${page.id}`,
        ),
      ];
      await fs.writeFile(
        path.join(outDir, "llms-full.txt"),
        `${full.join("\n\n---\n\n")}\n`,
      );
    },
  };
}
