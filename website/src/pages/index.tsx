import React from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import CodeBlock from "@theme/CodeBlock";
import Link from "@docusaurus/Link";

import Screenshot from "../components/Screenshot";

import "../css/custom.css";

const heroCode = `# blog/admin.py
from content_studio import register
from content_studio.admin import ModelStudio

from .models import Article


@register(Article)
class ArticleStudio(ModelStudio):
    table_display = ["title", "status", "published_at"]
    list_filter = ["status"]
    search_fields = ["title"]`;

const tour = [
  {
    name: "articles",
    title: "List page",
    to: "/docs/list-page",
    alt: "The list page of articles, with search, filters and a table",
  },
  {
    name: "article-edit",
    title: "Edit page",
    to: "/docs/edit-page",
    alt: "The edit page of an article, with a cover image and a sidebar",
  },
  {
    name: "media-library",
    title: "Media library",
    to: "/docs/media-library",
    alt: "The media library, with folders and a grid of images",
  },
  {
    name: "palette",
    title: "Command palette",
    to: "/docs/command-palette",
    alt: "The command palette open over the list page",
  },
];

const features = [
  {
    title: "Your models, as they are",
    text: "Register a plain Django model, as in the classic Django admin, and it is manageable. Nothing to migrate to, no content model to adopt.",
  },
  {
    title: "A complete admin",
    text: "List pages with search, filters and sorting, and edit pages with validation, inlines and audit stamps, configured in Python.",
  },
  {
    title: "Dedicated widgets",
    text: "Dates, rich text, tags, media and structured JSON each get their own widget, and edit pages are laid out with form sets.",
  },
  {
    title: "Familiar permissions",
    text: "The permission hooks of the classic Django admin, down to single objects, with multi-tenancy and limited login attempts.",
  },
  {
    title: "A dashboard you compose",
    text: "Statistics, content lists, recent activity and scheduled tasks, declared in Python, plus links and pages of your own in the menu.",
  },
  {
    title: "Batteries included",
    text: "Optional fields for rich text, tags, structured JSON, URL paths and media, and base models such as ContentModel and SingletonModel.",
  },
];

export default function Home(): React.JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  const { version, releaseUrl } = siteConfig.customFields as {
    version: string;
    releaseUrl: string;
  };

  return (
    <Layout
      title={`${siteConfig.title} — ${siteConfig.tagline}`}
      description="A modern alternative to the classic Django admin, with batteries included."
    >
      <main>
        <section className="hero-dbp">
          <div className="container">
            <div>
              <Link className="hero-release" href={releaseUrl}>
                <b>v{version}</b> What’s new →
              </Link>
              <h1>Django Content Studio</h1>
              <p className="tagline">
                A modern alternative to the classic Django admin, with batteries
                included. Register your models and manage them in a modern
                admin, with the permission hooks and conventions you already
                know.
              </p>
              <div className="buttons">
                <Link className="button button--primary" to="/docs/intro">
                  Read the docs
                </Link>
                <Link className="button" to="/docs/getting-started">
                  Get started
                </Link>
              </div>
            </div>
            <div className="hero-visual">
              <CodeBlock language="python">{heroCode}</CodeBlock>
            </div>
          </div>
        </section>

        <section className="showcase-dbp">
          <div className="container">
            <Screenshot
              name="dashboard"
              alt="The dashboard of a magazine site in Content Studio, with statistics, the latest articles, notifications and recent activity"
            />
            <div className="tour-grid">
              {tour.map((item) => (
                <Link className="tour-card" to={item.to} key={item.name}>
                  <Screenshot name={item.name} alt={item.alt} />
                  <span>{item.title}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="features-dbp">
          <div className="container">
            <h2>What you get</h2>
            <div className="features-grid">
              {features.map((feature) => (
                <div className="feature-card" key={feature.title}>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
