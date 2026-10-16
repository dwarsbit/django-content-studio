# Writing style guide

How the Content Studio documentation, the docs website and the README are
written: the voice, the words, and what they do and do not mention. It
applies to every user-facing text in this repository, and to anyone writing
it, people and AI agents alike. The changelog follows the voice and
terminology rules, but it records history, so the rules on what not to
mention do not apply to it.

When this guide and an existing page disagree, the guide wins: fix the page.

## 1. Voice and tone

**Talk to the reader as "you". Never write "we".** The project is
"Content Studio", not "we" or "us".

| Do | Don't |
|----|-------|
| Register the model and it appears in the admin. | We register the model so it appears in the admin. |
| Content Studio checks the upload against the allowlist. | We check uploads against our allowlist. |

**Plain and precise.** Write like the Django documentation: calm, factual,
specific. Explain *why* when the reason helps the reader decide or avoid a
mistake. No hype, no exclamation marks, no filler.

| Do | Don't |
|----|-------|
| Open `/admin/` and sign in with a staff account. | That's it! 🎉 Open `/admin/` and enjoy your shiny new admin! |
| Search runs on the fields in `search_fields`. | Powerful, blazing-fast search out of the box. |

Avoid these words: *simply, just, easy, easily, obviously, of course,
powerful, seamless(ly), blazing, magic(al), amazing, awesome, robust,
cutting-edge, leverage, utilize*. They promise or judge instead of inform.

**State limitations and risks plainly, with the fix.** Do not soften them
and do not alarm. Every caveat says what to do about it.

> Do: The throttles count in the cache. With the default per-process cache,
> every worker counts separately; configure a shared cache.
>
> Don't: Note that throttling might not work perfectly in some setups.

## 2. Spelling and mechanics

- **American English**: customize, behavior, color, license (noun and verb),
  canceled, catalog.
- **Sentence case** for every heading: "Media library", "Registering
  models", not "Media Library".
- **Em dashes sparingly**: at most one per paragraph. Prefer a period, a
  colon or parentheses. Never use an em dash where a comma works.
- **Short paragraphs**: about four sentences at most, one idea each. Lead
  with the point; details follow.
- **Lists** for three or more parallel items; a sentence for two.
- **Procedures** are numbered steps in the imperative ("Add…", "Run…",
  "Open…"), one action per step.
- **Code font** for anything you type or read in code: setting names
  (`TENANT_MODEL`), class names (`ModelStudio`), attributes
  (`table_display`), commands (`manage.py check`), file names
  (`settings.py`) and literal values (`None`, `"10/min"`).
- **Bold** only for a lead-in term in a list item, or a warning-level word.
  Do not bold for emphasis in running text.
- **Admonitions** (`:::note`, `:::caution`) for information the reader must
  not miss; at most one or two per page.
- **Links**: link the first mention of a setting, page or concept on a page;
  link text says where it goes ("see [Permissions](/docs/permissions)"), never
  "click here".

## 3. Emoji

One emoji per **page title**, unique across the site, for recognition in the
sidebar. No emoji anywhere else: not in section headings, body text, lists,
admonitions or the README.

## 4. Terminology

### The product

- **Content Studio** in running text.
- **Django Content Studio** only in page titles, the README headline and the
  first mention on the home page and in the introduction.
- Never *DCS*, *CS*, *the Studio* or *the studio app*.

### The admin

- **the admin**: Content Studio's interface, the place editors sign in and
  work.
- **the classic Django admin**: `django.contrib.admin`'s interface. Always
  this full phrase, so "admin" alone is never ambiguous.

| Do | Don't |
|----|-------|
| Like the classic Django admin, the admin checks model permissions. | Like the Django admin, the admin checks… |
| Open the admin at `/admin/`. | Open the studio / the Content Studio UI / the frontend. |

### Studios and the site

- **studio**: a `ModelStudio` (or `InlineModelStudio`) subclass in prose:
  "the article's studio", "add the field to the studio".
- **site**: the `ContentStudioSite` instance: "the site's dashboard",
  "subclass the site".
- Use the **class name in code font** only when the class itself is meant:
  "subclass `ModelStudio`", "`ContentStudioSite.get_tenants`".
- Name studio classes after the model: `ArticleStudio`, never
  `ArticleAdmin`.

### People

- **you**: the reader, a Django developer setting up and configuring
  Content Studio.
- **editors**: the people who work in the admin.
- **staff users**: the same people, when the text is about accounts,
  sign-in or permissions (`is_staff`).
- Not *end users*, *customers* or *admins* for either.

### Glossary

| Use | Not |
|-----|-----|
| admin (Content Studio's interface) | studio, frontend, UI, dashboard (for the whole interface), app |
| classic Django admin | Django admin, old admin, default admin |
| studio | model admin, admin class, config |
| site | admin site, AdminSite |
| editor | user (when meaning the people in the admin), end user |
| staff user | admin user, superuser (unless superuser is meant) |
| register a model | add a model, hook up a model |
| list page, table view, list view | overview, index, grid |
| edit page | form page, detail page |
| dashboard (the admin's start page) | home, landing page |
| media library | media manager, asset library |
| setting (`CONTENT_STUDIO["…"]`) | config option, parameter |
| system check | validation, lint |
| sign in / sign out | log in / log out, login (as a verb) |
| built-in fields, built-in models | blueprint fields, CMS fields |

## 5. What to mention, and what not

### Never mention

- **Implementation details.** Describe what Content Studio does for the
  reader, not how it is built.
- **The stack beyond Django.** No React, TypeScript, Vite, Tailwind, shadcn,
  Radix, TanStack, Django REST Framework or other libraries. The only
  exception: installation steps list the apps to add to `INSTALLED_APPS`,
  `rest_framework` included, without explaining it.
- **The internal API.** No endpoints, URLs under `api/`, wire formats,
  request headers (such as the tenant header) or the generated REST backend.
  It is plumbing for the admin, not a feature.
- **Unsupported extension points.** Custom widgets, formats, login backends
  and token backends: say they are not supported yet, never how to build one.
- **Roadmap promises.** No "coming soon", "planned for", dates or versions
  for features that do not ship. Describe what exists.
- **Version history in prose.** No "formerly", "used to", "since 1.1",
  "new in", "previously". History belongs in the changelog.
- **django-blueprint.** Not in the docs, the website or the README.

### Mention, with care

- **The classic Django admin**: the reference point. Say what is familiar
  ("like the classic Django admin, …") and what differs.
- **Other tools** (Wagtail, Unfold, Jazzmin, …): only on the one comparison
  page, factually and without judging them. Nowhere else.
- **django-headless**: only as a "see also" link, for readers who need an
  API for their own clients.
- **Django**: freely. Link to the Django documentation for Django concepts
  rather than explaining them again.

## 6. Code examples

- **Complete and runnable.** Every snippet includes its imports and works
  as-is in a project with Content Studio installed. If a snippet is a
  fragment of a larger file, say so in the text before it.
- **File path first.** Start each snippet with a comment naming the file:
  `# blog/admin.py`, `# mysite/settings.py`, `# mysite/studio.py`.
- **One example project**: a blog, used on every page.
  - project package `mysite`; app `blog`;
  - models `Article`, `Category`, `Review` (an inline of `Article`),
    `SiteSettings` (a singleton) and `LandingPage` (rich text);
  - studios `ArticleStudio`, `CategoryStudio`, `ReviewInline`;
  - the site in `mysite/studio.py`.
- **Plain Django first.** Show plain Django models and fields first; the
  built-in fields and models (`HTMLField`, `ContentModel`, …) come second,
  as an option. Never present them as the only way.
- **Real values.** Realistic names and values (`"Published"`,
  `"10/min"`), not `foo`, `bar` or `my_field`.
- **Formatted** like the codebase: black for Python, double quotes.

## 7. Page structure

1. **Title** with the page's emoji, in sentence case.
2. **Opening paragraph**: what the feature is and when to use it, in two or
   three sentences.
3. **The common case first**, with a complete example.
4. **Options and variations** after, most used first.
5. **Caveats** where they apply, each with its fix.
6. **Related pages** at the end when useful, as plain links.

The README follows the same voice and terminology. It covers what Content
Studio is, a short feature list without emoji, a quick start that works when
pasted, and links into the documentation; everything else lives on the docs
website.
