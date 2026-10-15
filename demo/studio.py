"""
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
