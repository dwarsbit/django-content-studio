###
# Form field classes are used for grouping, ordering and laying out fields.
###
import uuid
from dataclasses import dataclass
from typing import Optional, Type, Union

from django.db.models import Model
from django.utils.translation import gettext_lazy as _
from rest_framework.response import Response

from .utils import derive_uuid

__all__ = [
    "ActivityLog",
    "Button",
    "ButtonLink",
    "ButtonResult",
    "Component",
    "Field",
    "FieldLayout",
    "FormSet",
    "FormSetGroup",
    "Link",
    "TableColumn",
]


class Field:
    """
    Field class for configuring the fields in content edit views in Django Content Studio.
    """

    def __init__(
        self,
        name: str,
        col_span: int = 1,
        label: str = None,
        readonly: bool = False,
        widget: Type = None,
    ):
        self.name = name
        self.col_span = col_span
        self.label = label
        self.readonly = readonly
        # The widget class rendering the field. None falls back to
        # the field type's default widget.
        self.widget = widget

    def serialize(self):
        return {
            "type": "field",
            "name": self.name,
            "col_span": self.col_span,
            "label": self.label,
            "readonly": self.readonly,
            "widget": self.widget.__name__ if self.widget else None,
        }


class FieldLayout:
    """
    Field layout class for configuring the layout of fields in content edit views in Django Content Studio.
    """

    def __init__(self, fields: list[str | Field] = None, columns: int = 1):
        self.fields = [self._normalize_field(f) for f in fields] if fields else []
        self.columns = columns

    def serialize(self):
        return {
            "type": "field-layout",
            "fields": [field.serialize() for field in self.fields],
            "columns": self.columns,
        }

    def get_fields(self) -> list[Field]:
        return self.fields

    def _normalize_field(self, field):
        """
        Checks if a field is of an allowed type and wraps string fields in a Field object.
        """
        if isinstance(field, str):
            return Field(field)
        elif isinstance(field, Field):
            return field
        else:
            raise ValueError(f"Invalid field: {field}. Must be a string or Field.")


class TableColumn:
    """
    Column of a table view. A plain field name renders the field's
    values; a method name on the model studio renders the method's
    return value through the column's format.

    Method values must be JSON-safe types the format understands:
    strings for text-like formats, numbers for NumberFormat, ISO
    strings for the date and time formats.
    """

    def __init__(self, field: str, header: str = None, format: Type = None):
        self.field = field
        # The column header. None uses the field's verbose name and
        # leaves method columns unlabeled.
        self.header = header
        # The format class rendering the column's values. None falls
        # back to the field type's default format (TextFormat for
        # methods).
        self.format = format

    def serialize(self):
        return {
            "name": self.field,
            "header": self.header,
            "format": self.format.__name__ if self.format else None,
        }


class FormSet:
    """
    Formset class for configuring the blocks of fields in content edit views
    in Django Content Studio.
    """

    def __init__(
        self,
        title: str = "",
        description: str = "",
        fields: list[str | Field | FieldLayout] = None,
    ):
        self.title = title
        self.description = description
        self.fields = [self._normalize_field(f) for f in fields] if fields else []

    def serialize(self):
        return {
            "type": "form-set",
            "title": self.title,
            "description": self.description,
            "fields": [field.serialize() for field in self.fields],
        }

    def get_fields(self) -> list[Field]:
        """
        Returns a list of all Field and Component objects.
        """
        fields = []

        for field in self.fields:
            if isinstance(field, FieldLayout):
                fields = fields + field.get_fields()
            else:
                fields.append(field)

        return fields

    def _normalize_field(self, field):
        """
        Checks if a field is of an allowed type and wraps string fields in a Field object.
        """
        if isinstance(field, str):
            return Field(field)
        elif isinstance(field, Field):
            return field
        elif isinstance(field, FieldLayout):
            return field
        elif issubclass(field.__class__, Component):
            return field
        else:
            raise ValueError(
                f"Invalid field: {field}. Must be a string, Field, FieldLayout or a Component (subclass)."
            )


class FormSetGroup:
    """
    Formset group class for configuring the groups of form sets in content edit views.
    """

    def __init__(self, label: str = "", formsets: list[FormSet] = None):
        self.label = label
        self.formsets = formsets or []

    def serialize(self):
        return {
            "type": "form-set-group",
            "label": self.label,
            "formsets": [formset.serialize() for formset in self.formsets],
        }

    def get_fields(self) -> list[Field]:
        """
        Returns a list of all Field and Component objects.
        """
        fields = []

        for form_set in self.formsets:
            fields = fields + form_set.get_fields()

        return fields


class Component:
    component_id: uuid.UUID
    component_type: str

    def __init__(self, component_id=None):
        """
        The component ID is derived deterministically from the class and
        its ID parts, so all workers agree on it. Pass an explicit UUID
        to disambiguate components that share these.
        """
        if component_id is not None:
            self.component_id = uuid.UUID(str(component_id))
        else:
            self.component_id = derive_uuid(
                self.__class__.__module__,
                self.__class__.__qualname__,
                *self.get_id_parts(),
            )

    def get_id_parts(self):
        """
        Return the properties that define this component's identity.

        The parts feed the derived component ID, so every component
        should override this to return the values that distinguish it.
        Note that the method is called from __init__: only use
        attributes that are set before calling super().__init__().
        Components sharing their parts get the same ID and are rejected
        at setup.
        """
        return ()

    def serialize(self):
        return {
            "type": "component",
            "component_type": str(self.component_type),
            "component_id": str(self.component_id),
        }


class Link(Component):
    component_type = "Link"
    label: str

    def get_id_parts(self):
        return (self.label,)

    def get_url(self, obj: Type[Model], request):
        raise NotImplementedError

    def serialize(self):
        return {
            **super().serialize(),
            "label": self.label,
        }

    def handle_request(self, obj: Type[Model], request):
        return Response(data={"url": self.get_url(obj, request)})


class ButtonLink(Link):
    component_type = "LinkButton"

    # Add icon before label
    icon = None

    # Add copy to clipboard button
    copy = False

    def serialize(self):
        return {
            **super().serialize(),
            "icon": self.icon,
            "copy": self.copy,
        }


@dataclass
class ButtonResult:
    """
    What a button reports back to the editor: a message shown as a
    notification, and optionally a value shown once in a dialog with a
    copy button (such as a newly generated secret).
    """

    message: Optional[str] = None
    value: Optional[str] = None

    def serialize(self):
        return {
            "message": None if self.message is None else str(self.message),
            "value": self.value,
        }


class Button(Component):
    """
    A button on the edit page that runs handle() on the server for the
    object being edited:

        class PublishButton(Button):
            label = _("Publish")
            icon = "ph-bold ph-paper-plane-tilt"
            confirm = _("Publish this article?")
            allowed_permissions = ["change"]

            def handle(self, obj, request):
                obj.status = Article.Status.PUBLISHED
                obj.save(update_fields=["status"])
                return _("Published.")

    handle returns None, a message (shown as a notification) or a
    ButtonResult. allowed_permissions gates the button on the studio's
    has_<permission>_permission for the object, any one of them being
    enough (anyone who can view the object when empty); is_visible
    hides it per object. Buttons only show on saved objects.
    """

    component_type = "Button"
    label: str
    icon: Optional[str] = None
    # A question to confirm before the button runs.
    confirm: Optional[str] = None
    # Shown in the destructive style.
    destructive: bool = False
    allowed_permissions: Union[list[str], tuple[str, ...]] = ()

    def get_id_parts(self):
        return (self.label,)

    def is_visible(self, obj: Model, request) -> bool:
        return True

    def is_allowed(self, studio, obj: Model, request) -> bool:
        """Whether the request may see and run the button on obj."""
        allowed = not self.allowed_permissions or any(
            getattr(studio, f"has_{permission}_permission")(request, obj)
            for permission in self.allowed_permissions
        )

        return allowed and self.is_visible(obj, request)

    def handle(self, obj: Model, request) -> Union[None, str, ButtonResult]:
        raise NotImplementedError("A button needs a handle(obj, request) method.")

    def run(self, obj: Model, request) -> ButtonResult:
        result = self.handle(obj, request)

        if isinstance(result, ButtonResult):
            return result

        return ButtonResult(message=result)

    def serialize(self):
        return {
            **super().serialize(),
            "label": str(self.label),
            "icon": self.icon,
            "confirm": None if self.confirm is None else str(self.confirm),
            "destructive": self.destructive,
        }


class ActivityLog(Component):
    """
    The object's activity log, rendered in the edit view where the
    component is placed (usually the sidebar): the additions, changes
    and deletions recorded for the object, most recent first. The
    frontend fetches the entries through the generated API's activity
    endpoint, so the component itself handles no requests.
    """

    component_type = "ActivityLog"

    def __init__(self, title=None, component_id=None):
        # Set before super().__init__(): get_id_parts() reads it.
        self.title = title or _("Activity")
        super().__init__(component_id)

    def get_id_parts(self):
        return (self.title,)

    def serialize(self):
        return {
            **super().serialize(),
            "title": str(self.title),
        }
