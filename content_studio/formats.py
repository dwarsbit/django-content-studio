__all__ = [
    "BaseFormat",
    "BlockFormat",
    "BooleanFormat",
    "DateFormat",
    "DateTimeFormat",
    "FileSizeFormat",
    "ForeignKeyFormat",
    "HtmlFormat",
    "JSONFormat",
    "ManyMediaFormat",
    "MediaFormat",
    "NumberFormat",
    "TagFormat",
    "TextFormat",
    "TimeFormat",
]
###
# Formats determine how fields are displayed in Django Content Studio.
# Each Django model field has a default format, but this can be
# overridden in the admin model.
#
# A format is given as a class, or as an instance to pass options. A
# class is the instance without options.
###


class BaseFormat:
    def get_options(self) -> dict:
        """
        The format's options for the admin, as JSON-safe values. Unset
        options (None) are left out.
        """
        return {}

    def serialize(self):
        return {
            "name": self.__class__.__name__,
            "options": {
                key: value
                for key, value in self.get_options().items()
                if value is not None
            },
        }


class ForeignKeyFormat(BaseFormat):
    pass


class MediaFormat(BaseFormat):
    pass


class ManyMediaFormat(BaseFormat):
    pass


class TextFormat(BaseFormat):
    pass


class HtmlFormat(BaseFormat):
    pass


class BooleanFormat(BaseFormat):
    pass


class DateFormat(BaseFormat):
    pass


class DateTimeFormat(BaseFormat):
    pass


class TimeFormat(BaseFormat):
    pass


class NumberFormat(BaseFormat):
    pass


class FileSizeFormat(BaseFormat):
    pass


class TagFormat(BaseFormat):
    pass


class JSONFormat(BaseFormat):
    pass


class BlockFormat(BaseFormat):
    pass
