import React from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import CodeBlock from "@theme/CodeBlock";
import Link from "@docusaurus/Link";

import "../css/custom.css";

const heroCode = `from django.db import models

from content_studio import register
from content_studio.admin import ModelAdmin


@register(Article)
class ArticleAdmin(ModelAdmin):
    list_display = ["title", "status", "published_at"]
    list_filter = ["status"]
    search_fields = ["title"]`;

const features = [
  {
    emoji: "🎯",
    title: "Works with any model",
    text: "Like the classic Django admin: register a plain Django model and it is manageable. Content Studio brings no models of its own — it is an admin, not a CMS.",
  },
  {
    emoji: "⚡",
    title: "Auto-generated CRUD API",
    text: "A Django REST Framework API is generated for every registered model: pagination, search, filtering and ordering — with the React frontend as its first consumer.",
  },
  {
    emoji: "🧩",
    title: "Widgets and form sets",
    text: "Fields render with dedicated widgets — dates, rich text, tags, media, JSON with a schema — and edit views are laid out with form sets and field layouts.",
  },
  {
    emoji: "🛡️",
    title: "Admin permission hooks",
    text: "Model-level and per-object permission checks use the same hooks the Django admin calls. Multi-tenancy, throttled logins and audit stamps included.",
  },
  {
    emoji: "📊",
    title: "A dashboard you compose",
    text: "Statistics, content lists, activity logs and scheduled tasks as widgets you declare in Python — plus extensions like menu links and iframe pages.",
  },
  {
    emoji: "🤝",
    title: "Blueprint-aware, never required",
    text: "Django Blueprint fields get their dedicated widgets when it is installed, and everything works without it. The pairing is optional, end to end.",
  },
];

export default function Home(): React.JSX.Element {
  const { siteConfig } = useDocusaurusContext();

  return (
    <Layout
      title={`${siteConfig.title} — ${siteConfig.tagline}`}
      description="A modern, flexible alternative to the Django admin: a React frontend on an auto-generated Django REST Framework API."
    >
      <main>
        <section className="hero-dbp">
          <div className="container">
            <div>
              <h1>Django Content Studio</h1>
              <p className="tagline">
                A modern, flexible alternative to the Django admin. Register
                your models, get a React interface on an auto-generated API —
                with the same permission hooks and conventions you already
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

        <section className="features-dbp">
          <div className="container">
            <h2>What you get</h2>
            <div className="features-grid">
              {features.map((feature) => (
                <div className="feature-card" key={feature.title}>
                  <span className="emoji">{feature.emoji}</span>
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
