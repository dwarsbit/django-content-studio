import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

import llmsTxt from "./plugins/llms-txt";
import sidebars from "./sidebars";

const config: Config = {
  title: "Django Content Studio",
  tagline: "A modern Django admin alternative, batteries included",
  favicon: "img/favicon.svg",
  url: "https://djangocontentstudio.org",
  baseUrl: "/",
  organizationName: "dwarsbit",
  projectName: "django-content-studio",
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },
  trailingSlash: false,
  themes: [],
  plugins: [
    [
      llmsTxt,
      {
        summary:
          "A modern alternative to the classic Django admin, with batteries " +
          "included. Register a plain Django model and editors get a list " +
          "page, an edit page with dedicated widgets, a dashboard and a " +
          "media library, all configured in Python.",
        details: [
          "Content Studio is configured in Python: a studio (a `ModelStudio` " +
            "subclass registered with `content_studio.register` in an app's " +
            "`admin.py`) per model, and a site (a `ContentStudioSite` " +
            "subclass, named by the `ADMIN_SITE` setting) for the dashboard, " +
            "menus and extensions. Only the names on the Public API page are " +
            "supported; custom widgets, formats, components and dashboard " +
            "widget types are not. Run `python manage.py check` after a " +
            "change: the system checks report most configuration mistakes.",
        ],
        docs: sidebars.main as string[],
        optional: ["comparison"],
        skillsDir: "skills",
      },
    ],
    [
      "@docusaurus/plugin-client-redirects",
      {
        redirects: [
          { from: "/docs/content/registering-models", to: "/docs/registering-models" },
          { from: "/docs/content/block-fields", to: "/docs/block-fields" },
          { from: "/docs/forms/widgets", to: "/docs/widgets" },
          { from: "/docs/forms/form-sets", to: "/docs/edit-page" },
          { from: "/docs/security", to: "/docs/deployment" },
          { from: "/docs/system-checks", to: "/docs/deployment" },
          { from: "/docs/category/content", to: "/docs/registering-models" },
          { from: "/docs/category/widgets--forms", to: "/docs/widgets" },
        ],
      },
    ],
  ],
  themeConfig: {
    colorMode: {
      defaultMode: "light",
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Django Content Studio",
      logo: {
        alt: "Django Content Studio",
        src: "img/logo.svg",
      },
      items: [
        {
          label: "Docs",
          position: "left",
          to: "docs/intro",
        },
        {
          href: "https://github.com/dwarsbit/django-content-studio",
          label: "GitHub",
          position: "right",
        },
        {
          href: "https://pypi.org/project/django-content-studio/",
          label: "PyPI",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      copyright: `Copyright © ${new Date().getFullYear()} Leon van der Grient. Built with Django and Docusaurus.`,
      links: [
        {
          title: "Docs",
          items: [
            { label: "Introduction", to: "/docs/intro" },
            { label: "Getting started", to: "/docs/getting-started" },
            { label: "Registering models", to: "/docs/registering-models" },
            { label: "Media library", to: "/docs/media-library" },
            { label: "Dashboard", to: "/docs/dashboard" },
            {
              label: "Settings reference",
              to: "/docs/settings",
            },
          ],
        },
        {
          title: "Project",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/dwarsbit/django-content-studio",
            },
            {
              label: "PyPI",
              href: "https://pypi.org/project/django-content-studio/",
            },
            {
              label: "Changelog",
              href: "https://github.com/dwarsbit/django-content-studio/blob/main/CHANGELOG.md",
            },
          ],
        },
        {
          title: "Related",
          items: [
            {
              label: "Django Headless",
              href: "https://djangoheadless.org",
            },
          ],
        },
      ],
    },
    prism: {
      additionalLanguages: ["python", "bash", "json"],
    },
  },
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "docs",
          sidebarPath: "./sidebars.ts",
          editUrl:
            "https://github.com/dwarsbit/django-content-studio/edit/main/website/",
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],
};

export default config;
