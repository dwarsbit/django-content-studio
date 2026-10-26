import json
import re
import uuid
from types import SimpleNamespace

from django.apps import apps
from django.core import checks
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.utils.text import camel_case_to_spaces
from django.utils.translation import gettext_lazy as _
from django.utils.translation import ngettext

__all__ = [
    "Block",
    "BlockField",
]

###
# Blocks are the building parts of a BlockField: an ordered list of
# content blocks that editors add, reorder and remove freely. A block
# declares its fields as plain (unbound) Django model fields, which pick
# the widget and validate the block's data. Blocks are not models: they
# have no table, and all block data lives in the BlockField's JSON column.
###

META_OPTIONS = {"name", "verbose_name", "description", "icon"}

# Field kinds a block cannot store as a JSON value.
UNSUPPORTED_FIELDS = (
    models.ManyToManyField,
    models.FileField,
    models.AutoField,
    models.BigAutoField,
    models.SmallAutoField,
)


class BlockOptions:
    def __init__(self, cls, meta):
        unknown = set(vars(meta)) - META_OPTIONS if meta else set()
        unknown = {key for key in unknown if not key.startswith("_")}

        if unknown:
            raise TypeError(
                f"{cls.__name__}.Meta has invalid attribute(s): "
                f"{', '.join(sorted(unknown))}"
            )

        base_name = re.sub(r"Block$", "", cls.__name__) or cls.__name__

        self.name = getattr(meta, "name", None) or camel_case_to_spaces(
            base_name
        ).replace(" ", "_")
        self.verbose_name = getattr(meta, "verbose_name", None) or (
            camel_case_to_spaces(base_name).capitalize()
        )
        self.description = getattr(meta, "description", "")
        self.icon = getattr(meta, "icon", None)


class BlockMeta(type):
    """
    Collects the declared model fields, like a model's metaclass but
    without a table: the fields are never bound to a model.
    """

    def __new__(mcs, name, bases, attrs):
        meta = attrs.pop("Meta", None)
        declared = {
            key: value
            for key, value in attrs.items()
            if isinstance(value, models.Field)
        }

        for key in declared:
            attrs.pop(key)

        cls = super().__new__(mcs, name, bases, attrs)

        base_fields = {}
        for base in reversed(cls.__mro__[1:]):
            base_fields.update(getattr(base, "base_fields", {}))

        for key, field in declared.items():
            field.set_attributes_from_name(key)
            base_fields[key] = field

        cls.base_fields = base_fields
        cls._meta = BlockOptions(cls, meta)

        return cls


class Block(metaclass=BlockMeta):
    """
    A block type of a BlockField. Declare its fields as model fields:

        class ImageBlock(Block):
            image = MediaField()
            caption = models.CharField(max_length=200, blank=True)

            class Meta:
                verbose_name = "Image"
                icon = "ph-bold ph-image"
    """

    @classmethod
    def get_fields(cls) -> dict[str, models.Field]:
        """The block's fields, with lazy relations resolved."""
        for field in cls.base_fields.values():
            remote_field = getattr(field, "remote_field", None)

            if remote_field is not None and isinstance(remote_field.model, str):
                remote_field.model = apps.get_model(remote_field.model)

        return cls.base_fields

    @classmethod
    def clean(cls, data, get_queryset=None) -> dict:
        """
        Validates the block's data and returns it as stored: declared
        fields only, relations as primary keys, JSON-serializable values.
        Raises a ValidationError with a dict of field errors.
        """
        if not isinstance(data, dict):
            data = {}

        cleaned, errors = {}, {}

        for name, field in cls.get_fields().items():
            try:
                if field.is_relation:
                    value = clean_relation(field, data.get(name), get_queryset)
                elif name in data:
                    value = field.clean(data[name], None)
                else:
                    value = field.clean(field.get_default(), None)
            except ValidationError as e:
                errors[name] = e.messages
                continue

            cleaned[name] = to_json(value)

        if errors:
            raise ValidationError(errors)

        return cleaned

    @classmethod
    def serialize(cls) -> dict:
        from .serializers import ModelSerializer

        serializer = ModelSerializer(model=None)

        return {
            "name": cls._meta.name,
            "verbose_name": cls._meta.verbose_name,
            "description": cls._meta.description,
            "icon": cls._meta.icon,
            # The same shape as a model field, so the admin renders block
            # fields with the regular widgets.
            "fields": {
                name: serializer.get_field(field)
                for name, field in cls.get_fields().items()
            },
        }


def clean_relation(field, value, get_queryset=None):
    """
    A related object is given as {"id": ...} (the admin's shape) or as a
    bare primary key, and stored as its primary key.
    """
    if isinstance(value, dict):
        value = value.get("id")

    if value in field.empty_values:
        if not field.blank:
            raise ValidationError(field.error_messages["blank"], code="blank")
        return None

    model = field.related_model
    queryset = get_queryset(model) if get_queryset else model._default_manager.all()

    try:
        pk = model._meta.pk.to_python(value)
        queryset.get(pk=pk)
    except (ValidationError, ValueError, TypeError, ObjectDoesNotExist):
        raise ValidationError(_("Unknown related item."), code="invalid")

    return pk


def to_json(value):
    """Dates, decimals and UUIDs are stored the way Django encodes them."""
    return json.loads(json.dumps(value, cls=DjangoJSONEncoder))


class BlockErrors(Exception):
    """
    Errors of a BlockField value: either a list of messages about the
    whole value, or per block (by index) a dict of field errors.
    """

    def __init__(self, errors: list[str] | dict[int, dict[str, list[str]]]):
        self.errors = errors
        super().__init__(errors)

    def as_validation_error(self) -> ValidationError:
        if isinstance(self.errors, list):
            return ValidationError(self.errors)

        return ValidationError(
            [
                _("Block %(number)s, %(field)s: %(message)s")
                % {"number": index + 1, "field": name, "message": message}
                for index, fields in self.errors.items()
                for name, messages in fields.items()
                for message in messages
            ]
        )


class BlockField(models.JSONField):
    description = "An ordered list of content blocks."

    def __init__(self, *args, blocks=(), min_num=None, max_num=None, **kwargs):
        self.blocks = list(blocks)
        self.min_num = min_num
        self.max_num = max_num

        kwargs.setdefault("default", list)

        super().__init__(*args, **kwargs)

    @property
    def block_types(self) -> dict[str, type[Block]]:
        return {block._meta.name: block for block in self.blocks}

    def clean_blocks(self, value, get_queryset=None) -> list[dict] | None:
        """
        Validates a list of blocks and returns it as stored. Raises
        BlockErrors. `get_queryset(model)` limits which related objects
        blocks may refer to.
        """
        if value is None:
            return None

        if not isinstance(value, list):
            raise BlockErrors([_("Enter a list of blocks.")])

        block_types = self.block_types
        errors, ids = [], set()

        for index, item in enumerate(value):
            number = index + 1

            if not isinstance(item, dict) or not isinstance(item.get("type"), str):
                errors.append(
                    _("Block %(number)s is not a valid block.") % {"number": number}
                )
            elif item["type"] not in block_types:
                errors.append(
                    _("Block %(number)s has an unknown type: %(type)s.")
                    % {"number": number, "type": item["type"]}
                )
            elif item.get("id") is not None and item["id"] in ids:
                errors.append(
                    _("Block %(number)s has the same id as another block.")
                    % {"number": number}
                )
            else:
                ids.add(item.get("id"))

        count = len(value)

        if self.min_num is not None and count < self.min_num:
            errors.append(
                ngettext(
                    "Add at least %(num)d block.",
                    "Add at least %(num)d blocks.",
                    self.min_num,
                )
                % {"num": self.min_num}
            )

        if self.max_num is not None and count > self.max_num:
            errors.append(
                ngettext(
                    "Use at most %(num)d block.",
                    "Use at most %(num)d blocks.",
                    self.max_num,
                )
                % {"num": self.max_num}
            )

        if errors:
            raise BlockErrors(errors)

        cleaned, block_errors = [], {}

        for index, item in enumerate(value):
            block = block_types[item["type"]]

            try:
                data = block.clean(item.get("data"), get_queryset)
            except ValidationError as e:
                block_errors[index] = e.message_dict
                continue

            cleaned.append(
                {
                    "id": str(item.get("id") or uuid.uuid4()),
                    "type": item["type"],
                    "data": data,
                }
            )

        if block_errors:
            raise BlockErrors(block_errors)

        return cleaned

    def clean(self, value, model_instance):
        value = self.to_python(value)
        self.validate(value, model_instance)

        try:
            value = self.clean_blocks(value)
        except BlockErrors as e:
            raise e.as_validation_error()

        self.run_validators(value)

        return value

    def pre_save(self, model_instance, add):
        """
        Runs each block field's own save-time normalization, such as the
        HTMLField sanitizer, on the block data.
        """
        value = super().pre_save(model_instance, add)

        if not isinstance(value, list):
            return value

        block_types = self.block_types
        saved = []

        for item in value:
            block = (
                block_types.get(item.get("type")) if isinstance(item, dict) else None
            )

            if block is None or not isinstance(item.get("data"), dict):
                saved.append(item)
                continue

            data = dict(item["data"])

            for name, field in block.get_fields().items():
                if name in data and not field.is_relation:
                    holder = SimpleNamespace(**{field.attname: data[name]})
                    data[name] = to_json(field.pre_save(holder, add))

            saved.append({**item, "data": data})

        setattr(model_instance, self.attname, saved)

        return saved

    def check(self, **kwargs):
        return [*super().check(**kwargs), *self._check_blocks()]

    def _check_blocks(self):
        errors = []

        def error(msg):
            errors.append(checks.Error(msg, obj=self, id="content_studio.E018"))

        if not self.blocks:
            error("BlockField needs at least one block in blocks.")

        names = set()

        for block in self.blocks:
            if not (isinstance(block, type) and issubclass(block, Block)):
                error(f"{block!r} in blocks is not a Block subclass.")
                continue

            if block._meta.name in names:
                error(f"Two blocks are named {block._meta.name!r}.")
            names.add(block._meta.name)

            for name, field in block.base_fields.items():
                if isinstance(field, (BlockField, *UNSUPPORTED_FIELDS)):
                    error(
                        f"{block.__name__}.{name}: a "
                        f"{field.__class__.__name__} cannot be used in a block."
                    )
                elif field.is_relation:
                    try:
                        block.get_fields()
                    except (LookupError, ValueError):
                        error(
                            f"{block.__name__}.{name}: the related model "
                            f"{field.remote_field.model!r} is not installed."
                        )

        for option in ("min_num", "max_num"):
            num = getattr(self, option)
            if num is not None and (
                not isinstance(num, int) or isinstance(num, bool) or num < 0
            ):
                error(f"{option} must be a non-negative integer.")

        if (
            isinstance(self.min_num, int)
            and isinstance(self.max_num, int)
            and self.min_num > self.max_num
        ):
            error("min_num cannot be greater than max_num.")

        return errors

    def cs_get_field_attributes(self):
        return {
            "blocks": [
                block.serialize()
                for block in self.blocks
                if isinstance(block, type) and issubclass(block, Block)
            ],
            "min_num": self.min_num,
            "max_num": self.max_num,
        }
