"""
Verify the built wheel ships what users need: the compiled frontend
assets and the compiled translation catalogs.

Run after `poetry build`:

    python scripts/check_wheel.py
"""

import glob
import sys
import zipfile


def main():
    wheels = glob.glob("dist/*.whl")

    problems = []

    if not wheels:
        problems.append("no wheel found in dist/ — run `poetry build` first")
        wheels = []

    for wheel in wheels:
        names = zipfile.ZipFile(wheel).namelist()

        required = {
            "content_studio/static/content_studio/assets/": (
                "compiled frontend assets (run `npm run build` first)"
            ),
            "content_studio/locale/nl/LC_MESSAGES/django.mo": (
                "compiled translation catalogs"
            ),
            "content_studio/viewsets.py": ("the python package itself"),
        }

        for path, label in required.items():
            if not any(name.startswith(path) or name == path for name in names):
                problems.append(f"{wheel} is missing {label} ({path})")

    if problems:
        for problem in problems:
            print(f"ERROR: {problem}")
        sys.exit(1)

    for wheel in wheels:
        print(f"OK: {wheel} contains the compiled assets and translations")


if __name__ == "__main__":
    main()
