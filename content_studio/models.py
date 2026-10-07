from django.db import models

from .utils import is_jsonable, get_tenant_field_name


class ModelSerializer:
    def __init__(self, model: type[models.Model]):
        self.model = model

    def serialize(self):
        model = self.model

        tenant_field = get_tenant_field_name(self.model)

        return {
            "label": model._meta.label_lower,
            "verbose_name": model._meta.verbose_name,
            "verbose_name_plural": model._meta.verbose_name_plural,
            "fields": self.get_fields(),
            "tenant_field": tenant_field,
        }

    def get_fields(self):
        fields = {
            "__str__": {
                "type": "CharField",
                "readonly": True,
            }
        }
        standard_fields = self.model._meta.fields
        m2m_fields = self.model._meta.many_to_many

        for field in standard_fields + m2m_fields:
            fields[field.name] = self.get_field(field)

        return fields

    def get_field(self, field):
        data = {
            "verbose_name": field.verbose_name,
            # Match Django admin semantics: blank controls whether a
            # value must be provided.
            "required": not field.blank,
            "type": field.__class__.__name__,
        }

        if hasattr(field, "widget_class"):
            data["widget_class"] = field.widget_class.__name__

        if hasattr(field, "format_class"):
            data["format_class"] = field.format_class.__name__

        if field.help_text:
            data["help_text"] = field.help_text

        if is_jsonable(field.default):
            data["default"] = field.default

        if not field.editable:
            data["readonly"] = True

        if field.primary_key:
            data["primary_key"] = True
            data["readonly"] = True

        if field.is_relation:
            data["related_model"] = field.related_model._meta.label_lower

        if getattr(field, "choices", None) is not None:
            data["choices"] = field.choices

        if getattr(field, "max_length", None) is not None:
            data["max_length"] = field.max_length

        if getattr(field, "cs_get_field_attributes", None):
            data.update(field.cs_get_field_attributes())

        return data
