import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Django Content Studio",
  tagline: "A modern, flexible alternative to the Django admin",
  favicon: "img/favicon.svg",
  url: "https://dwarsbit.github.io",
  baseUrl: "/django-content-studio/",
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
              label: "Django Blueprint",
              href: "https://dwarsbit.github.io/django-blueprint/",
            },
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
