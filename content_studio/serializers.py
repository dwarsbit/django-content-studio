import copy
import inspect
import posixpath

from django.contrib.auth import get_user_model
from django.core.exceptions import FieldDoesNotExist
from django.db import models
from rest_framework import serializers
from rest_framework.fields import SkipField
from rest_framework.relations import RelatedField

from content_studio.settings import cs_settings
from content_studio.uniqueness import get_unique_sets
from content_studio.validators import ColorValidator
from content_studio.utils import (
    get_tenant_field_name,
    get_tenant_scoped_queryset,
    is_jsonable,
)


def represent_related(value, request):
    """The admin's representation of a related object."""
    from .admin import get_relation_display_for

    admin_site = cs_settings.ADMIN_SITE
    display = get_relation_display_for(value.__class__, value, request)
    data = {"id": value.pk, "__str__": display.title}

    if display.description:
        data["description"] = display.description

    if display.icon:
        data["icon"] = display.icon

    if display.initials:
        data["initials"] = display.initials

    if display.avatar:
        data["avatar"] = display.avatar

    # Add file URL and media type if the model is a media library model.
    if value.__class__ is cs_settings.MEDIA_LIBRARY_MODEL:
        data["file"] = value.file.url
        data["type"] = value.type
        data["thumbnail"] = admin_site.get_thumbnail(value)

    return data


class ContentRelatedField(RelatedField):

    def to_representation(self, value):
        return represent_related(value, self.context.get("request"))

    def get_queryset(self):
        """
        Related objects of tenant-scoped models can only be picked from
        the request's tenant.
        """
        queryset = super().get_queryset()
        request = self.context.get("request")

        if request is None or queryset is None:
            return queryset

        return get_tenant_scoped_queryset(request, queryset.model, queryset)

    def to_internal_value(self, data):
        from django.core.exceptions import ObjectDoesNotExist
        from django.core.exceptions import ValidationError as DjangoValidationError

        try:
            return self.get_queryset().get(pk=data["id"])
        except (TypeError, KeyError, ValueError, DjangoValidationError):
            raise serializers.ValidationError(
                "A related item must be given as {'id': ...}."
            )
        except ObjectDoesNotExist:
            raise serializers.ValidationError("Unknown related item.")


class BlockSerializerField(serializers.JSONField):
    """
    A BlockField in the admin: relations in blocks travel in the same
    shape as a model's relations, and errors are keyed by block index.
    """

    def __init__(self, *args, block_field, **kwargs):
        self.block_field = block_field
        super().__init__(*args, **kwargs)

    def get_related_queryset(self, model):
        """Blocks can only refer to objects of the request's tenant."""
        request = self.context.get("request")
        queryset = model._default_manager.all()

        if request is None:
            return queryset

        return get_tenant_scoped_queryset(request, model, queryset)

    def to_internal_value(self, data):
        from django.core.exceptions import ValidationError as DjangoValidationError

        from .blocks import BlockErrors

        value = super().to_internal_value(data)

        try:
            self.block_field.validate(value, None)
            return self.block_field.clean_blocks(value, self.get_related_queryset)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages)
        except BlockErrors as e:
            # The errors mirror the value: body.<index>.data.<field>, and
            # so on for blocks inside blocks.
            raise serializers.ValidationError(e.as_data())

    def to_representation(self, value):
        from .blocks import iter_blocks

        value = super().to_representation(value)

        if not isinstance(value, list):
            return value

        # A copy, whose block data takes the related objects' representation.
        value = copy.deepcopy(list(value))
        request = self.context.get("request")

        # The primary keys per related model, so each model takes one query,
        # for the blocks inside blocks too.
        wanted: dict[type[models.Model], set] = {}

        for block, data in iter_blocks(value, self.block_field):
            for name, field in block.get_fields().items():
                if field.is_relation and data.get(name) is not None:
                    wanted.setdefault(field.related_model, set()).add(data[name])

        objects = {
            model: {
                str(obj.pk): represent_related(obj, request)
                for obj in self.get_related_queryset(model).filter(pk__in=pks)
            }
            for model, pks in wanted.items()
        }

        for block, data in iter_blocks(value, self.block_field):
            for name, field in block.get_fields().items():
                if field.is_relation and data.get(name) is not None:
                    # Missing objects (deleted, or of another tenant) show
                    # as empty.
                    data[name] = objects[field.related_model].get(str(data[name]))

        return value


class ContentFileField(serializers.Field):
    """
    A FileField or ImageField: {"name", "url"} out, plus "thumbnail"
    for an ImageField (None without a file). In, {"upload": token} attaches a temporary upload (see
    uploads.py), None clears the field, and anything else, such as the
    value as it was sent out, leaves the file unchanged: a path is never
    taken from the editor.
    """

    def __init__(self, *, model_field, **kwargs):
        self.model_field = model_field
        super().__init__(**kwargs)

    def to_representation(self, value):
        if not value:
            return None

        try:
            url = value.url
        except ValueError:
            url = None

        data = {"name": posixpath.basename(value.name), "url": url}

        # An image also gets a small thumbnail, for tables and previews;
        # None when thumbnails are off or the image cannot be read.
        if isinstance(self.model_field, models.ImageField):
            from .thumbnails import get_thumbnail_url

            data["thumbnail"] = get_thumbnail_url(value, "small")

        return data

    def to_internal_value(self, data):
        from .uploads import open_upload

        if isinstance(data, dict) and isinstance(data.get("upload"), str):
            return open_upload(
                self.context.get("request"),
                self.parent.Meta.model,
                self.model_field.name,
                data["upload"],
            )

        raise SkipField()


class WriteOnlyCharField(serializers.CharField):
    """
    A field with a write-only PasswordWidget: its value never leaves the
    server. Out, only whether it is set; in, a new value replaces it, an
    empty one clears it and the value as it was sent out keeps it.
    """

    def to_representation(self, value):
        return {"is_set": bool(value)}

    def to_internal_value(self, data):
        if isinstance(data, dict):
            raise SkipField()

        return super().to_internal_value(data)


class ContentSerializer(serializers.ModelSerializer):
    __str__ = serializers.CharField(read_only=True)
    serializer_related_field = ContentRelatedField

    # The model properties a studio names explicitly (table columns, form
    # fields, read-only fields). Only these are added to an "__all__" or
    # exclude field list: properties are never serialized implicitly, so a
    # computed value stays out of the admin unless a studio asks for it.
    named_properties: frozenset[str] = frozenset()

    # The fields edited with a write-only PasswordWidget: their values
    # are never serialized, in any view.
    write_only_fields: frozenset[str] = frozenset()

    def get_fields(self):
        fields = super().get_fields()

        for name in self.write_only_fields:
            field = fields.get(name)

            if isinstance(field, serializers.CharField):
                fields[name] = WriteOnlyCharField(*field._args, **field._kwargs)

        return fields

    def save(self, **kwargs):
        from .uploads import TemporaryUpload, discard_upload

        instance = super().save(**kwargs)

        # Attached uploads were copied to the field's own storage.
        for value in (self.validated_data or {}).values():
            if isinstance(value, TemporaryUpload):
                discard_upload(value)

        return instance

    def get_field_names(self, declared_fields, info):
        fields = list(super().get_field_names(declared_fields, info))

        for name in self._get_named_properties():
            if name not in fields and name not in declared_fields:
                fields.append(name)

        return fields

    def _get_named_properties(self) -> list[str]:
        """
        The named properties that are public properties of the model.
        """
        model = self.Meta.model

        return [
            name
            for name in sorted(self.named_properties)
            if not name.startswith("_")
            and isinstance(inspect.getattr_static(model, name, None), property)
        ]

    def build_property_field(self, field_name, model_class):
        """
        Create a ReadOnlyField for property attributes.
        """
        return serializers.ReadOnlyField, {}

    def build_standard_field(self, field_name, model_field):
        from .blocks import BlockField

        field_class, field_kwargs = super().build_standard_field(
            field_name, model_field
        )

        if isinstance(model_field, BlockField):
            field_class = BlockSerializerField
            field_kwargs["block_field"] = model_field

        if isinstance(model_field, models.FileField):
            field_class = ContentFileField
            field_kwargs = {
                key: value
                for key, value in field_kwargs.items()
                if key in ("required", "read_only", "label", "help_text")
            }
            field_kwargs["model_field"] = model_field
            # A blank file field can be cleared.
            field_kwargs["allow_null"] = model_field.blank

        return field_class, field_kwargs

    def build_field(self, field_name, info, model_class, nested_depth):
        """
        Override to handle property fields.
        """
        # Check if this is a property
        if hasattr(model_class, field_name):
            attr = getattr(model_class, field_name)
            if isinstance(attr, property):
                return self.build_property_field(field_name, model_class)

        # Fall back to default behavior for regular fields
        return super().build_field(field_name, info, model_class, nested_depth)


class RelatedItemSerializer(serializers.Serializer):
    """
    Serializer for use in the relations endpoint. The id is PK-agnostic:
    models are free to use integer or string primary keys. The display of an
    item is resolved through the related model admin's
    get_relation_display: description and icon are present when customized.
    """

    id = serializers.CharField()
    __str__ = serializers.CharField()
    description = serializers.CharField(required=False)
    icon = serializers.CharField(required=False)
    initials = serializers.CharField(required=False)
    avatar = serializers.CharField(required=False)


def session_user_field_names(user_model) -> list[str]:
    """
    The session user fields: id, the username field, and the optional
    name fields when the user model has them (custom user models may
    not).
    """
    fields = ["id", "username"]

    for name in ("first_name", "last_name"):
        try:
            user_model._meta.get_field(name)
        except FieldDoesNotExist:
            continue
        fields.append(name)

    return fields


_session_user_serializers: dict = {}


def get_session_user_serializer():
    """
    Build the session user serializer lazily: get_user_model() cannot be
    called at import time (the app registry may not be ready yet), and
    custom user models may lack the name fields.
    """
    user_model = get_user_model()

    if user_model in _session_user_serializers:
        return _session_user_serializers[user_model]

    class SessionUserSerializer(serializers.ModelSerializer):
        class Meta:
            model = user_model
            fields = session_user_field_names(user_model)

    if user_model.USERNAME_FIELD != "username":
        # A declared field is needed when the username field has
        # another name; a redundant source is rejected by DRF.
        SessionUserSerializer._declared_fields["username"] = serializers.CharField(
            source=user_model.USERNAME_FIELD
        )

    _session_user_serializers[user_model] = SessionUserSerializer
    return SessionUserSerializer


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
            # Combinations of fields the editor checks for duplicates.
            "unique_sets": [
                unique_set.serialize() for unique_set in get_unique_sets(model)
            ],
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

        tenant_field = get_tenant_field_name(self.model)

        for field in standard_fields + m2m_fields:
            fields[field.name] = self.get_field(field)

            # The tenant is set from the selected tenant, never edited.
            if field.name == tenant_field:
                fields[field.name]["readonly"] = True

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

        # Unique fields get a duplicate check while editing; the primary
        # key is read-only and never checked.
        if field.unique and not field.primary_key:
            data["unique"] = True

        if field.is_relation:
            data["related_model"] = field.related_model._meta.label_lower

        if getattr(field, "choices", None) is not None:
            data["choices"] = field.choices

        if getattr(field, "max_length", None) is not None:
            data["max_length"] = field.max_length

        # A plain field with a ColorValidator gets the color picker's
        # notation from the validator; a ColorField sets its own below.
        color_validator = next(
            (v for v in field.validators if isinstance(v, ColorValidator)), None
        )
        if color_validator is not None:
            data["color_format"] = color_validator.color_format or "hex"
            data["alpha"] = color_validator.alpha

        if getattr(field, "cs_get_field_attributes", None):
            data.update(field.cs_get_field_attributes())

        return data
