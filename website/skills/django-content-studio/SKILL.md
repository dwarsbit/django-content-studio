---
name: django-content-studio
description: Set up and configure Django Content Studio, a modern alternative to the classic Django admin. Use when a Django project uses or adds django-content-studio (content_studio in INSTALLED_APPS, ModelStudio, ContentStudioSite), to register models, lay out list and edit pages, pick widgets and formats, add conditional fields, dashboards, menu links, analytics, the media library or block fields.
---

# Django Content Studio

Content Studio is a modern alternative to the classic Django admin. It
manages the models a project already has: register a plain Django model with
a studio and editors get a list page, an edit page, a dashboard and a media
library. Everything is configured in Python; there is no frontend code to
write.

The documentation is at https://djangocontentstudio.org. Every page is also
available as Markdown, for example
https://djangocontentstudio.org/docs/edit-page.md, and all pages together in
https://djangocontentstudio.org/llms-full.txt. Read the page for a feature
before using an option this skill does not show.

## Ground rules

- **Use the public API only.** The supported names are listed on
  https://djangocontentstudio.org/docs/public-api.md. Do not import from
  `content_studio.utils`, `serializers`, `viewsets`, `views`, `router` or
  other modules that are not listed, and do not call the admin's internal
  REST endpoints. For an API for your own clients, use django-headless.
- **Built-in types only.** Custom widgets, formats, component types and
  dashboard widget types are not supported: the admin has no renderer for
  them. Subclass the built-in components and widgets instead.
- **Plain Django first.** Every feature works with plain Django models and
  fields. The built-in fields (`content_studio.fields`) and base models
  (`content_studio.models`) are optional. Never import the `blueprint`
  package.
- **Run `python manage.py check` after every change.** The system checks
  (`content_studio.E001`–`E041`, `W001`–`W024`) report most configuration
  mistakes: unknown fields, required fields missing from the form, duplicate
  IDs, wrong widget types. Treat warnings as bugs.

## Install

```bash
pip install django-content-studio
# Optional extras: "django-content-studio[excel]" for .xlsx exports,
# "django-content-studio[huey]" for the Huey task dashboard.
```

```python
# mysite/settings.py
INSTALLED_APPS = [
    "django.contrib.admin",  # keep it: Content Studio logs activity with it
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",  # required
    "content_studio",
    "blog",
]
```

```python
# mysite/urls.py
from django.urls import include, path

urlpatterns = [
    path("admin/", include("content_studio.urls")),
]
```

Then run `python manage.py init_content_studio` (non-interactive:
`--no-input`, plus `--media-item`, `--media-folder`, `--tenant` as
`app_label.Model` and `--login-backend`). It writes `mysite/studio.py` with
a site and adds `CONTENT_STUDIO = {"ADMIN_SITE": "mysite.studio.admin_site"}`
to the settings. Only active staff users can log in, as in the classic
Django admin. All settings: https://djangocontentstudio.org/docs/settings.md.

## Register a model

Registrations go in the app's `admin.py`, with `content_studio.register`
(not `django.contrib.admin.register`: the classic Django admin's registry is
not read). Name studios after the model: `ArticleStudio`.

```python
# blog/admin.py
from content_studio import register
from content_studio.admin import InlineModelStudio, ModelStudio

from .models import Article, Review


class ReviewInline(InlineModelStudio):
    model = Review
    table_display = ["text", "stars"]


@register(Article)
class ArticleStudio(ModelStudio):
    table_display = ["title", "status", "published_at"]
    list_filter = ["status"]
    search_fields = ["title"]
    ordering = ["-published_at"]
    icon = "ph-bold ph-article"
    inlines = [ReviewInline]
```

Common studio options: `table_display`, `list_filter`, `search_fields`,
`sortable_by`, `ordering`, `list_per_page`, `list_description`,
`list_views` (`["table", "list"]`) with `list_item_display`, `soft_delete`,
`reorder_field` and `reorder_scope`, `allow_duplication` and
`duplicate_inlines`, `export_fields` or `allow_export`, `edit_width`
(`"default"` or `"wide"`), `readonly_fields`, `prepopulated_fields`,
`exclude`, `is_singleton`, `presence` and `icon`.

Hooks, as in the classic Django admin: `has_view_permission`,
`has_add_permission`, `has_change_permission`, `has_delete_permission`
(each `(request, obj=None)`), `get_queryset(request)`,
`get_readonly_fields(request, obj=None)`,
`get_prepopulated_fields(request, obj=None)`,
`get_list_item_display(obj, request)`, `get_relation_display(obj, request)`
(returns a `RelationDisplay`), `get_duplicate_initial(request, obj)` and
`get_created_result(request, obj)`.

Icons are Phosphor bold icons everywhere: `"ph-bold ph-<name>"`.

Docs: https://djangocontentstudio.org/docs/registering-models.md and
https://djangocontentstudio.org/docs/permissions.md.

## List page

`table_display` takes field names, model properties, studio methods and
`TableColumn(field, header=None, format=None)`. A studio method column takes
`(obj, request)`. Only columns backed by a model field are sortable.

```python
# blog/admin.py
from content_studio import register
from content_studio.actions import bulk_action
from content_studio.admin import ModelStudio
from content_studio.form import TableColumn
from content_studio.formats import BadgeFormat, NumberFormat
from content_studio.signals import record_change

from .models import Article


@register(Article)
class ArticleStudio(ModelStudio):
    table_display = [
        "title",
        TableColumn(
            field="status",
            format=BadgeFormat(colors={"draft": "gray", "published": "green"}),
        ),
        TableColumn(field="get_word_count", header="Words", format=NumberFormat),
    ]
    soft_delete = "removed_at"  # a nullable date(time) field: deleting trashes
    export_fields = ["title", "status", "published_at"]

    def get_word_count(self, obj, request):
        return len(obj.body.split())

    @bulk_action(label="Publish", icon="ph-bold ph-paper-plane-tilt")
    def publish(self, request, queryset):
        articles = list(queryset)
        queryset.update(status=Article.Status.PUBLISHED)
        for article in articles:
            record_change(request, article, "updated", "Published.")
        return len(articles)
```

Bulk actions need change permission unless `allowed_permissions` says
otherwise, and record nothing in the history by themselves: call
`record_change`. Docs: https://djangocontentstudio.org/docs/list-page.md.

## Edit page

`edit_main` and `edit_sidebar` lay out the edit page with the building
blocks in `content_studio.form`:

- `Field(name, col_span=1, label=None, readonly=False, widget=None, when=None)`;
  a plain string is short for `Field(name)`.
- `FieldLayout(fields=[...], columns=1)`: fields side by side.
- `FormSet(title="", description="", fields=[...], when=None)`: a titled card.
- `FormSetGroup(label, formsets=[...], when=None)`: a tab of form sets.
- Components: `Title`, `Subtitle`, `Text` (Markdown), `Callout`
  (`variant="info" | "success" | "warning" | "danger"`), `Link`,
  `ButtonLink`, `Button`, `ActivityLog`, `SEOPreview` and, from
  `content_studio.analytics`, `Analytics`.
- `edit_header`: buttons and links next to the save button (no text
  components, no fields).

```python
# blog/admin.py
from django.db.models import Q

from content_studio import register, widgets
from content_studio.admin import ModelStudio
from content_studio.form import ActivityLog, Button, Callout, Field, FormSet

from .models import Article


class PublishButton(Button):
    label = "Publish"
    icon = "ph-bold ph-paper-plane-tilt"
    confirm = "Publish this article?"
    allowed_permissions = ["change"]

    def is_visible(self, obj, request):
        return obj.status != Article.Status.PUBLISHED

    def handle(self, obj, request):
        obj.status = Article.Status.PUBLISHED
        obj.save(update_fields=["status"])
        return "Published."


@register(Article)
class ArticleStudio(ModelStudio):
    edit_main = [
        FormSet(
            title="Content",
            fields=[
                "title",
                Field("status", col_span=1),
                Field("body", widget=widgets.TextAreaWidget(rows=12)),
            ],
        ),
        FormSet(
            title="Publishing",
            fields=["published_at"],
            when=Q(status=Article.Status.PUBLISHED),
        ),
    ]
    edit_sidebar = [
        Callout("Published articles change on the site when you save."),
        Field("featured", widget=widgets.SwitchWidget),
        PublishButton(),
        ActivityLog(),
    ]
    edit_header = [PublishButton(component_id="0f9a2c1e-3b7d-4c55-9a1e-2f6b8d4c7e10")]
```

Every required model field must be on the form (`edit_main` or
`edit_sidebar`): the edit page only saves what it shows. Subclass a text
component and override `get_text(obj, request)` for text that depends on the
object; subclass `Link`/`ButtonLink` and override `get_url(obj, request)`.
Two components of the same class and settings on one studio need an
explicit `component_id` (a fixed UUID string).

Docs: https://djangocontentstudio.org/docs/edit-page.md.

### Conditional fields

`when=` on a `Field`, a component, a `FormSet` or a `FormSetGroup` shows it
only while the form's values match a Django `Q` object. The edit page
applies it while the editor types.

- Combine with `&`, `|`, `~`. Values: literals, choices, model instances,
  `F("other_field")`, `Now()` (from `django.db.models.functions`), also
  `Now() + timedelta(days=7)`.
- Lookups: `exact`, `iexact`, `in`, `isnull`, `gt`, `gte`, `lt`, `lte`,
  `range`, `contains`, `icontains`, `startswith`, `istartswith`, `endswith`,
  `iendswith`.
- Only the model's own fields: no `author__username`, no
  `published_at__year`. A foreign key compares by primary key
  (`Q(author=3)`); an empty text field equals `""`.
- A hidden field is not saved and not required. A required field that only
  shows under a condition makes creating fail (`W024`): give it a default,
  `blank=True` or `null=True`.
- Conditions are not permissions; use `readonly_fields` and the permission
  hooks to restrict editors.

For a rule a `Q` cannot express, subclass `Condition` from
`content_studio.form`, list the values it reads in `fields` and implement
`check(self, values, request)`. It runs on the server while the editor
types and again on save, so keep it fast and free of side effects.
`Condition` instances combine with `Q` objects: `when=~Q(body="") & ~MeetsHouseStyle()`.

## Widgets

Content Studio picks a widget from the field type (`CharField` →
`InputWidget`, `TextField` → `TextAreaWidget`, `ForeignKey` →
`ForeignKeyWidget`, `DateTimeField` → `DateTimeWidget`, `JSONField` →
`JSONWidget`, fields with choices → a select, and so on). Override per
field with `Field(name, widget=...)`, as a class or an instance with
keyword options. Options are validated when the studio is defined; they
guide editors but do not validate input, so add model validators for
rules.

Widgets to choose (all in `content_studio.widgets`):

| Widget | For |
|--------|-----|
| `SwitchWidget` | `BooleanField` as a toggle |
| `ToggleGroupWidget`, `RadioButtonWidget`, `SelectWidget` | fields with choices |
| `InputWidget(placeholder, prefix, suffix, min_value, max_value, step, show_count, recommended_length)` | text and numbers |
| `TextAreaWidget(rows, placeholder, show_count, recommended_length)` | `TextField` |
| `MarkdownWidget`, `CodeWidget(language="css" \| "html" \| "javascript" \| "json")` | Markdown or code in a `TextField` |
| `RichTextWidget(features, heading_levels)` | `HTMLField` |
| `SliderWidget(min_value, max_value, step=1, suffix=None)`, `RatingWidget(max_value=5)` | numbers |
| `DateWidget` / `DateTimeWidget(min_date, max_date)`, `DurationWidget(show_days, show_seconds)` | dates, durations |
| `PasswordWidget(write_only=False)` | secrets such as API keys |
| `EmailWidget`, `URLWidget`, `PhoneWidget`, `EmbedWidget` | addresses, phone numbers, oEmbed URLs |
| `KeyValueWidget`, `ListWidget`, `MapWidget(lng_field, center, zoom)` | `JSONField` dicts, lists, locations |
| `ColorPickerWidget(show_input, swatches)`, `IconPickerWidget` | colors, Phosphor icon classes |
| `CoverImageWidget(aspect_ratio, min_width, min_height)` | a `MediaField` cover image |
| `FileWidget` | `FileField`, `ImageField` |

To change the default for a field type, extend the site's
`default_widget_mapping` (`{**ContentStudioSite.default_widget_mapping, models.EmailField: widgets.InputWidget}`).
Docs: https://djangocontentstudio.org/docs/widgets.md.

## Formats

Formats (in `content_studio.formats`) show values on the list page and in
read-only fields. Defaults follow the field type. Use them in
`TableColumn(format=...)` or the site's `default_format_mapping`:
`NumberFormat(decimals, compact, prefix, suffix)`, `CurrencyFormat("EUR")`,
`PercentFormat(fraction=False)`, `BadgeFormat(colors={...})` (colors
`gray`, `blue`, `green`, `yellow`, `red`, `purple`),
`DateFormat(style="short" | "medium" | "long")`,
`DateTimeFormat(relative=False)`, `TextFormat(max_length, lines)`,
`DurationFormat(style)`, `ProgressFormat(max_value=100)`,
`BooleanFormat(labels=("In stock", "Sold out"), colors=("green", "red"))`,
`CodeFormat`, `FileSizeFormat`. Docs:
https://djangocontentstudio.org/docs/widgets.md#formats.

## The site: menus, dashboard, extensions

Subclass `ContentStudioSite` in its own module, so `admin.py` modules can
import it, and point `ADMIN_SITE` at the instance.

```python
# mysite/studio.py
from django.core.cache import cache

from content_studio.admin import ContentStudioSite, ModelGroup
from content_studio.dashboard import Dashboard
from content_studio.dashboard.activity_log import ActivityLogWidget
from content_studio.dashboard.statistic import StatisticWidget
from content_studio.extensions import (
    DashboardPage,
    IFramePage,
    MainMenuButton,
    MainMenuLink,
    UserMenuLink,
)

from blog.models import Article, Category, SiteSettings


class PublishedArticlesWidget(StatisticWidget):
    def get_data(self, request):
        return {
            "title": "Published articles",
            "value": Article.objects.filter(status="published").count(),
            "icon": "ph-bold ph-check-circle",
        }


class ClearCacheButton(MainMenuButton):
    label = "Clear cache"
    icon = "ph-bold ph-broom"
    confirm = "Clear the cache for every visitor?"

    def is_visible(self, request):
        return request.user.is_superuser

    def handle(self, request):
        cache.clear()
        return "The cache is cleared."


class BlogStudioSite(ContentStudioSite):
    model_groups = [
        ModelGroup("content", icon="ph-bold ph-article", models=[Article, Category]),
        ModelGroup("site", label="Site", models=[SiteSettings], collapsed=True),
    ]
    dashboard = Dashboard(widgets=[PublishedArticlesWidget(), ActivityLogWidget()])
    extensions = [
        MainMenuLink(
            url="https://status.example.com",
            label="Status",
            icon="ph-bold ph-heartbeat",
        ),
        ClearCacheButton(),
        IFramePage(
            path="reports/", iframe_url="https://metabase.example.com/dashboard/1"
        ),
        DashboardPage(
            path="stats/",
            title="Statistics",
            dashboard=Dashboard(
                widgets=[
                    PublishedArticlesWidget(
                        widget_id="5b0c7d7e-8a59-4a39-9a0a-4e1b2f8f1c21"
                    )
                ]
            ),
        ),
        UserMenuLink(
            url="https://help.example.com", label="Help", icon="ph-bold ph-question"
        ),
    ]


admin_site = BlogStudioSite()
```

- **Dashboard widgets** subclass a built-in widget and implement
  `get_data(request)`, returning a dict (or a DRF serializer):
  `StatisticWidget` (`value`, `title`, `prefix`, `suffix`, `trend`,
  `trend_sentiment`, `trend_label`, `icon`, `footnote`, `series`,
  `max_value`; class attribute `number_format`), `ContentListWidget`
  (`title`, `content`: items with `model` like `"blog.article"`, `id`,
  `title`, optional `description`, `status`, `status_variant`,
  `thumbnail`, `timestamp`), `ScheduledTasksWidget` (`tasks`).
  `ActivityLogWidget` and `SpacingWidget(col_span)` need no data.
  `col_span` and `refresh_interval` (seconds) are class attributes.
  Widget IDs must be unique across the start page and every
  `DashboardPage`: pass `widget_id` for a second widget of the same class.
- **Menus**: `MainMenuLink` / `UserMenuLink` (`url`, `label`, `icon`,
  `color`, `weight`) and `MainMenuButton` / `UserMenuButton` (implement
  `handle(request)`, return a message or a `ButtonResult`). Override
  `is_visible(request)` to limit who sees them. A `url` is a page of the
  admin (`"/reports/"`) or an `http(s)` URL.
- **Pages**: `IFramePage(path, iframe_url, sandbox=...)`,
  `DashboardPage(path, title, dashboard, description=None)`, and
  `TaskDashboard(adapter=...)` from `content_studio.dashboard.tasks` with a
  `TaskAdapter` subclass, or `HueyAdapter()` from
  `content_studio.contrib.huey`. Paths of the admin's own pages, such as
  `content/` and `media-library/`, are taken.
- Two identical extensions need an `extension_id` (a fixed UUID).

Docs: https://djangocontentstudio.org/docs/dashboard.md and
https://djangocontentstudio.org/docs/extensions.md.

## Analytics

```python
# mysite/studio.py
from django.conf import settings

from content_studio.admin import ContentStudioSite
from content_studio.analytics import (
    AnalyticsExtension,
    AnalyticsLink,
    AnalyticsPage,
    AnalyticsStatisticWidget,
    UmamiProvider,
)
from content_studio.dashboard import Dashboard


class BlogStudioSite(ContentStudioSite):
    dashboard = Dashboard(widgets=[AnalyticsStatisticWidget(metric="visitors")])
    extensions = [
        AnalyticsExtension(
            provider=UmamiProvider(
                website_id=settings.UMAMI_WEBSITE_ID,
                api_key=settings.UMAMI_API_KEY,
            ),
        ),
        AnalyticsPage(),
        AnalyticsLink(),
    ]


admin_site = BlogStudioSite()
```

Add `Analytics(path_field="slug", path_prefix="/blog/", path_suffix="/")`
to a studio's `edit_sidebar` (compact) or `edit_main` (full report) to show
the object's page statistics. `AnalyticsTopPagesWidget(limit=5)` lists the
top pages. Exactly one `AnalyticsExtension` is required for any of these
(`E037`). For another tool, subclass `AnalyticsProvider`. Keep the API key
in a setting read from the environment. Docs:
https://djangocontentstudio.org/docs/analytics.md.

## Content fields, media and blocks

- **Built-in fields** (`content_studio.fields`): `HTMLField` (sanitized
  rich text), `TagField`, `HashTagField`, `FlexField` (JSON with a schema),
  `MultipleChoiceField`, `URLPathField`, `ColorField(color_format="hex", alpha=False)`.
- **Base models** (`content_studio.models`): `ContentModel`,
  `SingletonModel`, `SoftDeletableModel` (`removed_at`), `ManualOrderModel`
  (`order_key`), `TimeStampedModel`, `UUIDModel`, `EditorModel`.
- **Media library**: set `MEDIA_LIBRARY_MODEL` (and optionally
  `MEDIA_LIBRARY_FOLDER_MODEL`) to your own models, or add
  `"content_studio.media_library"` to `INSTALLED_APPS` and use
  `"content_studio.media_library.models.Media"` and `...Folder`. Then use
  `MediaField(to)` / `ManyMediaField(to)` from
  `content_studio.media_library.fields` on your models. Docs:
  https://djangocontentstudio.org/docs/media-library.md.
- **Block fields**: `BlockField(blocks=[TextBlock, ImageBlock], max_num=20)`
  from `content_studio.blocks`, where each block subclasses `Block` and
  declares plain model fields. Blocks are not models (no migrations). No
  `ManyToManyField`, `ManyMediaField` or `FileField` in a block: use a
  `MediaField`. Render with `{% load content_studio %}{% render_blocks page.sections %}`.
  Docs: https://djangocontentstudio.org/docs/block-fields.md.

## Other features

Each is optional and has its own page:

- Webhooks (`"content_studio.webhooks"` app, `DeployButton`):
  https://djangocontentstudio.org/docs/webhooks.md
- Notifications (`"content_studio.notifications"` app, `register_event`,
  `notify`): https://djangocontentstudio.org/docs/notifications.md
- Multi-tenancy (`TENANT_MODEL`, `ContentStudioSite.get_tenants`):
  https://djangocontentstudio.org/docs/multi-tenancy.md
- Login backends, sessions and password reset:
  https://djangocontentstudio.org/docs/authentication.md
- The profile page (every editor's own changes, details and password;
  `ContentStudioSite.profile_fields` picks the user model fields editors
  may change, default `first_name`, `last_name`, `email`):
  https://djangocontentstudio.org/docs/profile.md
- Presence, the command palette, deployment and every system check:
  https://djangocontentstudio.org/docs/presence.md,
  https://djangocontentstudio.org/docs/command-palette.md,
  https://djangocontentstudio.org/docs/deployment.md

## Common mistakes

- Registering with `django.contrib.admin` instead of `content_studio.register`,
  or outside the app's `admin.py`: the model does not appear.
- Leaving out `rest_framework` or `django.contrib.admin` from
  `INSTALLED_APPS`.
- Using `list_display` for columns (works, but `W010`: rename it to
  `table_display`) or a dict in it (`E001`: that is `list_item_display`).
- A required field missing from `edit_main`/`edit_sidebar` (`W001`), or
  read-only (`W002`): saving fails.
- Writing a custom `BaseWidget`, `BaseFormat`, `Component` or
  `DashboardWidget` subclass with a type of its own: the admin cannot show
  it (`W012` reports such dashboard widgets). Subclass the built-in ones.
- Text components or fields in `edit_header` (`E020`), or text components
  in a `FieldLayout`.
- Two components, widgets or extensions with the same settings and no
  explicit ID (`E003`–`E005`). Use a fixed UUID literal, never `uuid4()`.
- `when=` with a related lookup or transform, or a field the model does not
  have or the form excludes (`E040`).
- Studio method columns and `get_*_display` hooks take `(obj, request)`;
  permission hooks take `(request, obj=None)`.
- Bulk actions and buttons that change objects without `record_change`: the
  change is missing from the object's history.
- A local-memory cache in production: presence, login throttling and ended
  sessions need a shared cache (`CACHES`). See the deployment checklist.
