__all__ = [
    "BaseWidget",
    "CheckboxWidget",
    "DateTimeWidget",
    "DateWidget",
    "ForeignKeyWidget",
    "InputWidget",
    "JSONSchemaWidget",
    "JSONWidget",
    "ManyMediaWidget",
    "ManyToManyWidget",
    "MediaWidget",
    "MultiSelectWidget",
    "RadioButtonWidget",
    "RichTextWidget",
    "SelectWidget",
    "SlugWidget",
    "SwitchWidget",
    "TagWidget",
    "TextAreaWidget",
    "TimeWidget",
    "ToggleGroupWidget",
    "URLPathWidget",
]
###
# Widgets determine what input field is used for a certain
# model field. Each Django model field has a default widget,
# but this can be overridden in the admin model.
###


class BaseWidget:
    @classmethod
    def serialize(cls):
        return {"name": cls.__name__}


class InputWidget(BaseWidget):
    pass


class TextAreaWidget(BaseWidget):
    pass


class SwitchWidget(BaseWidget):
    pass


class ToggleGroupWidget(BaseWidget):
    pass


class CheckboxWidget(BaseWidget):
    pass


class DateWidget(BaseWidget):
    pass


class DateTimeWidget(BaseWidget):
    pass


class TimeWidget(BaseWidget):
    pass


class RichTextWidget(BaseWidget):
    pass


class RadioButtonWidget(BaseWidget):
    pass


class SelectWidget(BaseWidget):
    pass


class MultiSelectWidget(BaseWidget):
    pass


class URLPathWidget(BaseWidget):
    pass


class SlugWidget(BaseWidget):
    pass


class ForeignKeyWidget(BaseWidget):
    pass


class ManyToManyWidget(BaseWidget):
    pass


class JSONSchemaWidget(BaseWidget):
    pass


class JSONWidget(BaseWidget):
    pass


class MediaWidget(BaseWidget):
    pass


class ManyMediaWidget(BaseWidget):
    pass


class TagWidget(BaseWidget):
    pass
