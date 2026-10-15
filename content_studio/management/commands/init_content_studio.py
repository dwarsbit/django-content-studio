"""
Initialize Content Studio in a Django project: create a studio.py with
a ContentStudioSite instance, and add the CONTENT_STUDIO settings
block — asking about the media library, tenancy and login backends.
"""

import importlib
import re
import sys
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.urls import URLResolver, get_resolver
from pick import pick

from content_studio.login_backends import AVAILABLE_LOGIN_BACKENDS

STUDIO_TEMPLATE = '''"""
The project's Content Studio site: point the ADMIN_SITE setting in
CONTENT_STUDIO at the admin_site instance below. Hooks for
customization are documented on the ContentStudioSite class.
"""

from content_studio.admin import ContentStudioSite

admin_site = ContentStudioSite()

# Hooks you can add, e.g.:
#
# def get_thumbnail(self, obj):
#     """The thumbnail URL for an image item."""
#     return obj.thumbnail.url if obj.thumbnail else obj.file.url
#
# def crop_image(self, obj, crop_info):
#     """Cropping, enabled by its mere presence."""
#     ...
'''


# The ESC key, as curses reports it: asks for confirmation to abort.
ESCAPE_KEY = 27

# Confirmation answers
EXIT_NO = "No"
EXIT_YES = "Yes"


def model_import_path(model) -> str:
    """The model's import path string, as the settings expect."""
    return f"{model.__module__}.{model.__name__}"


class Command(BaseCommand):
    help = (
        "Initialize Content Studio: create a studio.py with a "
        "ContentStudioSite instance and add the CONTENT_STUDIO settings "
        "block."
    )
    # Initialization is run before the project is necessarily valid;
    # unrelated check failures should not block it.
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument(
            "--media-item",
            help="The media library item model, as 'app_label.Model'.",
        )
        parser.add_argument(
            "--media-folder",
            help="The media library folder model, as 'app_label.Model'.",
        )
        parser.add_argument(
            "--tenant",
            help="The tenant model, as 'app_label.Model'.",
        )
        parser.add_argument(
            "--login-backend",
            help="The login backend's import path string.",
        )
        parser.add_argument(
            "--no-input",
            action="store_true",
            help="Run without prompts, using the flags' values and "
            "defaults for everything unset.",
        )

    def handle(self, **options):
        if not apps.is_installed("content_studio"):
            raise CommandError(
                "content_studio is not in INSTALLED_APPS. Add it — after "
                "django.contrib.admin — and run this command again."
            )

        module_name, settings_path, project_package = self._locate()
        studio_module = f"{project_package}.studio" if project_package else "studio"
        studio_path = settings_path.parent / "studio.py"

        self.stdout.write(self.style.MIGRATE_HEADING("Initialize Content Studio"))
        self.stdout.write(
            "This creates a studio.py with your ContentStudioSite instance "
            f"(the {studio_module} module) and adds the CONTENT_STUDIO "
            "settings block, asking about the media library, "
            "multi-tenancy and the login backend along the way. "
            "Everything is optional: existing files are left alone, and "
            "the prompts move with the arrow keys."
        )
        self.stdout.write("")

        interactive = not options["no_input"]

        # The arrow-key prompts need a terminal; piped runs fall back
        # to the defaults, with the flags available for specifics.
        if interactive and not sys.stdin.isatty():
            self.stdout.write(
                self.style.WARNING(
                    "No interactive terminal; using defaults. Pass the "
                    "flags to configure specifics."
                )
            )
            interactive = False

        models = sorted(apps.get_models(), key=lambda model: model._meta.label_lower)

        media_item = self._resolve_or_prompt_model(
            "Media library item model", options["media_item"], interactive, models
        )

        # A folder model only makes sense with an item model.
        if media_item is None and not options["media_folder"]:
            media_folder = None
        else:
            media_folder = self._resolve_or_prompt_model(
                "Media library folder model",
                options["media_folder"],
                interactive,
                models,
            )

        tenant = self._resolve_or_prompt_model(
            "Tenant model", options["tenant"], interactive, models
        )

        if options["login_backend"]:
            login_backends = [options["login_backend"]]
        elif interactive:
            login_backends = [
                self._prompt_choice(
                    "Login backend", AVAILABLE_LOGIN_BACKENDS, default_index=1
                )
            ]
        else:
            login_backends = [AVAILABLE_LOGIN_BACKENDS[0]]

        self._write_studio(studio_path)
        self._add_settings(
            settings_path,
            f"{studio_module}.admin_site",
            media_item,
            media_folder,
            tenant,
            login_backends,
        )

        self._report(studio_module, media_item, tenant)

    # --- Location and prompts ------------------------------------------

    def _locate(self):
        """
        The settings module's name, its file, and the project package
        dotted path (the parent package of the settings module).
        """
        module_name = settings.SETTINGS_MODULE
        module = importlib.import_module(module_name)

        project_package = module_name.rsplit(".", 1)[0] if "." in module_name else ""

        return module_name, Path(module.__file__), project_package

    def _resolve_or_prompt_model(self, label, configured, interactive, models):
        """
        The chosen model: a flag value resolves without prompting; an
        interactive run offers the installed models (none is the
        default); --no-input keeps None.
        """
        if configured:
            try:
                return apps.get_model(configured)
            except (LookupError, ValueError):
                raise CommandError(f"Unknown model {configured!r} for {label}.")

        if not interactive:
            return None

        return self._prompt_choice(
            label,
            models,
            display=lambda model: model._meta.label_lower,
        )

    def _prompt_choice(self, question, options, display=str, default_index=None):
        """
        An arrow-key selection over the options: moving with the up and
        down arrows, confirming with enter. A "None" entry leads when
        there is no default, so canceling (Ctrl-C) and choosing it both
        come out as the default. ESC asks for confirmation to abort the
        whole command; declining re-asks.
        """
        default = options[default_index - 1] if default_index else None

        choices = [display(option) for option in options]

        if default is None:
            choices.insert(0, "None")

        while True:
            try:
                _, index = pick(
                    choices,
                    title=question,
                    indicator=">",
                    quit_keys=[ESCAPE_KEY],
                )
            except KeyboardInterrupt:
                return default

            # pick reports a quit key as index -1.
            if index == -1:
                if self._confirm_exit():
                    raise CommandError("Aborted.")

                continue

            if default is None:
                # The leading "None" entry shifts the options by one.
                return None if index == 0 else options[index - 1]

            return options[index]

    def _confirm_exit(self) -> bool:
        """
        Whether to abort the command, asked after ESC: choosing "Yes"
        — or interrupting with Ctrl-C — aborts; "No", the highlighted
        default, returns to the prompt.
        """
        try:
            answer, _ = pick(
                [EXIT_NO, EXIT_YES],
                title="Do you want to exit?",
                indicator=">",
            )
        except KeyboardInterrupt:
            return True

        return answer == EXIT_YES

    # --- File writes ---------------------------------------------------

    def _write_studio(self, studio_path):
        if studio_path.exists():
            self.stdout.write(
                self.style.WARNING(f"{studio_path} already exists; leaving it as is.")
            )
            return

        studio_path.write_text(STUDIO_TEMPLATE)

        self.stdout.write(self.style.SUCCESS(f"Created {studio_path}."))

    def _add_settings(
        self,
        settings_path,
        admin_site,
        media_item,
        media_folder,
        tenant,
        login_backends,
    ):
        content = settings_path.read_text()

        if re.search(r"^CONTENT_STUDIO\s*=", content, re.MULTILINE):
            self.stdout.write(
                self.style.WARNING(
                    f"CONTENT_STUDIO already exists in {settings_path}; this "
                    "step is skipped. Merge the values you want manually."
                )
            )
            return

        block = self._render_settings_block(
            admin_site, media_item, media_folder, tenant, login_backends
        )

        settings_path.write_text(content.rstrip("\n") + "\n\n\n" + block)

        self.stdout.write(
            self.style.SUCCESS(f"Added CONTENT_STUDIO to {settings_path}.")
        )

    def _render_settings_block(
        self, admin_site, media_item, media_folder, tenant, login_backends
    ):
        def setting(key, model):
            if model is None:
                return f'    "{key}": None,'

            return f'    "{key}": "{model_import_path(model)}",'

        backends = ", ".join(f'"{backend}"' for backend in login_backends)

        return "\n".join(
            [
                "CONTENT_STUDIO = {",
                f'    "ADMIN_SITE": "{admin_site}",',
                f'    "LOGIN_BACKENDS": [{backends}],',
                setting("MEDIA_LIBRARY_MODEL", media_item),
                setting("MEDIA_LIBRARY_FOLDER_MODEL", media_folder),
                setting("TENANT_MODEL", tenant),
                "}",
            ]
        )

    # --- Reporting -----------------------------------------------------

    def _report(self, studio_module, media_item, tenant):
        if not self._urls_mounted():
            self.stdout.write(
                self.style.NOTICE(
                    "content_studio.urls does not appear to be mounted; add "
                    'e.g. path("admin/", include("content_studio.urls")) to '
                    "your urlpatterns."
                )
            )

        self.stdout.write("")
        self.stdout.write("Next steps:")
        self.stdout.write(
            f"  1. Point ADMIN_SITE at your site (already done: {studio_module}.admin_site)."
        )
        self.stdout.write(
            "  2. Register models with @register(Model) and a ModelStudio subclass."
        )

        if media_item is None:
            self.stdout.write(
                "  3. No media library configured; point MEDIA_LIBRARY_MODEL at "
                "a model to enable the library."
            )
        else:
            self.stdout.write(
                "  3. Verify the media library model's contract "
                "(file, name and type fields)."
            )

        if tenant is not None:
            self.stdout.write(
                "  4. A tenant model is configured; send the tenant's ID "
                "through the API's tenant header."
            )

        self.stdout.write("  Run manage.py check to validate the configuration.")

    def _urls_mounted(self) -> bool:
        """Whether content_studio.urls appears in the urlconf."""
        try:
            return self._search_patterns(get_resolver().url_patterns)
        except Exception:
            # An unresolvable urlconf is not this command's problem; the
            # reminder stays helpful either way.
            return False

    def _search_patterns(self, patterns) -> bool:
        for pattern in patterns:
            if not isinstance(pattern, URLResolver):
                continue

            module = pattern.urlconf_module

            if getattr(module, "__name__", None) == "content_studio.urls":
                return True

            if self._search_patterns(pattern.url_patterns):
                return True

        return False
