#!/usr/bin/env python
"""Django's command-line utility for the Content Studio demo project."""

import os
import sys
from pathlib import Path

# Make the repository root importable, so `content_studio` resolves to the
# source tree and the `demo` package is importable from anywhere.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "demo.settings")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
