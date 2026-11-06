###
# Conditions: when a field, component, form set or tab of the edit page
# shows. A condition is a Django Q object over the form's values, or a
# Condition subclass that runs Python on the server; Q objects combine
# both with &, | and ~.
#
# The admin evaluates a condition in the browser as the editor types,
# and again on the server when the object is saved, from the same
# serialized form: serialize() turns a condition into a tree, and
# evaluate() here and frontend/src/lib/conditions.ts evaluate that tree
# with the same rules (tests/conditions_cases.json keeps them in step).
###
import datetime
import decimal
import enum
import re
import uuid
from typing import Any, Callable, Iterator, Optional, Union

from django.db.models import F, Model, Q
from django.db.models.expressions import CombinedExpression, Value
from django.db.models.functions import Now
from django.utils import timezone

from .utils import derive_uuid

# Condition is public through content_studio.form.
__all__ = []

# The lookups a Q condition may use; any other lookup (or a transform
# such as __date or __year) is rejected.
LOOKUPS = frozenset(
    {
        "exact",
        "iexact",
        "in",
        "isnull",
        "gt",
        "gte",
        "lt",
        "lte",
        "range",
        "contains",
        "icontains",
        "startswith",
        "istartswith",
        "endswith",
        "iendswith",
    }
)


class ConditionError(ValueError):
    """A condition the admin cannot evaluate in the browser."""


class Condition:
    """
    A condition decided by Python on the server, for what a Q object
    cannot express:

        class MeetsHouseStyle(Condition):
            fields = ["description"]

            def check(self, values, request):
                return house_style.passes(values["description"])

        Callout(_("The description does not meet the house style."),
                variant="warning", when=~MeetsHouseStyle())

    fields names the form values check() reads. The admin sends them to
    the server as the editor types (debounced) and shows or hides what
    the condition guards when the answer arrives; until then, it stays
    hidden. Values arrive as the form holds them: text, numbers and
    booleans as they are, related objects as their primary key (a list
    for many-to-many fields), dates and times as ISO 8601 strings, and
    None for empty fields.

    Conditions combine with Q objects and each other through &, | and
    ~. check() also runs when the object is saved, for conditions that
    guard fields, so keep it fast and free of side effects.
    """

    # The form values check() reads, by field name.
    fields: Union[list[str], tuple[str, ...]] = ()

    # Combines with Q objects: Q(...) & condition.
    conditional = True

    def __init__(self, *, condition_id=None):
        if isinstance(self.fields, str) or not all(
            isinstance(name, str) and name for name in self.fields
        ):
            raise TypeError(
                f"{self.__class__.__name__}.fields must be a list of field "
                f"names; got {self.fields!r}."
            )

        if condition_id is not None:
            self.condition_id = uuid.UUID(str(condition_id))
        else:
            self.condition_id = derive_uuid(
                self.__class__.__module__,
                self.__class__.__qualname__,
                *self.fields,
                *self.get_id_parts(),
            )

    def get_id_parts(self):
        """
        The options that define this condition beyond its class and
        fields, for conditions that take options; see Component.
        """
        return ()

    def check(self, values: dict[str, Any], request) -> bool:
        raise NotImplementedError("A condition needs a check(values, request) method.")

    def run(self, values: dict[str, Any], request) -> bool:
        """check() on the condition's own fields of values."""
        return bool(
            self.check({name: values.get(name) for name in self.fields}, request)
        )

    # Q's own combination, so a condition can lead: condition & Q(...).
    def __and__(self, other):
        return Q(self) & other

    def __or__(self, other):
        return Q(self) | other

    def __xor__(self, other):
        return Q(self) ^ other

    def __invert__(self):
        return ~Q(self)

    def copy(self):
        # Q() & condition copies the condition.
        return self

    def __repr__(self):
        return f"<{self.__class__.__name__}: {', '.join(self.fields)}>"


def validate(when, owner: str) -> None:
    """
    Raise when a when= value is not a Q object or Condition, or uses
    something the browser cannot evaluate.
    """
    if when is None:
        return

    if not isinstance(when, (Q, Condition)):
        raise TypeError(
            f"{owner} when= must be a Q object or a Condition; got {when!r}."
        )

    try:
        serialize(when)
    except ConditionError as error:
        raise ValueError(f"{owner} when=: {error}") from None


def serialize(when) -> Optional[dict]:
    """The tree the admin evaluates, or None for no condition."""
    if when is None:
        return None

    return _serialize_node(when)


def _serialize_node(node) -> dict:
    if isinstance(node, Condition):
        return {"condition": str(node.condition_id), "fields": list(node.fields)}

    if isinstance(node, Q):
        return {
            "connector": node.connector,
            "negated": node.negated,
            "children": [_serialize_node(child) for child in node.children],
        }

    if isinstance(node, tuple) and len(node) == 2:
        return _serialize_lookup(*node)

    raise ConditionError(
        f"{node!r} is not supported in a condition: use field lookups, "
        "Q objects and Condition subclasses."
    )


def _serialize_lookup(path: str, value) -> dict:
    parts = path.split("__")
    lookup = "exact"

    if len(parts) > 1 and parts[-1] in LOOKUPS:
        lookup = parts.pop()

    if len(parts) > 1:
        raise ConditionError(
            f"{path!r}: conditions read the form's own fields, so related "
            "fields (author__name) and transforms (published_at__year) "
            f"are not supported. Lookups: {', '.join(sorted(LOOKUPS))}."
        )

    if lookup in ("in", "range"):
        if isinstance(value, (str, bytes)) or not hasattr(value, "__iter__"):
            raise ConditionError(f"{path!r} needs a list of values.")

        value = list(value)

        if lookup == "range" and len(value) != 2:
            raise ConditionError(f"{path!r} needs two values: (low, high).")

    if lookup == "isnull" and not isinstance(value, bool):
        raise ConditionError(f"{path!r} needs True or False.")

    return {"field": parts[0], "lookup": lookup, "value": _encode(value, path)}


def _encode(value, path: str):
    """A condition's value as JSON, with dates, field references and the
    current time tagged."""
    if isinstance(value, F):
        if "__" in value.name:
            raise ConditionError(
                f"{path!r}: F({value.name!r}) reads a related field, which "
                "conditions do not support."
            )
        return {"$field": value.name}

    if isinstance(value, Now):
        return {"$now": 0}

    if isinstance(value, CombinedExpression):
        if (
            isinstance(value.lhs, Now)
            and value.connector in ("+", "-")
            and isinstance(value.rhs, Value)
            and isinstance(value.rhs.value, datetime.timedelta)
        ):
            seconds = value.rhs.value.total_seconds()
            return {"$now": seconds if value.connector == "+" else -seconds}

        raise ConditionError(
            f"{path!r}: the only arithmetic conditions support is "
            "Now() + timedelta(...) or Now() - timedelta(...)."
        )

    if isinstance(value, Value):
        return _encode(value.value, path)

    if isinstance(value, Model):
        return _encode(value.pk, path)

    if isinstance(value, enum.Enum):
        return _encode(value.value, path)

    if isinstance(value, datetime.datetime):
        if timezone.is_naive(value):
            value = timezone.make_aware(value)
        return {"$datetime": value.isoformat()}

    if isinstance(value, datetime.date):
        return {"$date": value.isoformat()}

    if isinstance(value, datetime.time):
        return {"$time": value.isoformat()}

    if isinstance(value, decimal.Decimal):
        return float(value)

    if isinstance(value, uuid.UUID):
        return str(value)

    if value is None or isinstance(value, (bool, int, float, str)):
        return value

    if isinstance(value, (list, tuple, set, frozenset)):
        return [_encode(item, path) for item in value]

    raise ConditionError(f"{path!r}: {value!r} is not supported as a value.")


def iter_conditions(when) -> Iterator[Condition]:
    """The Condition objects inside a condition."""
    if isinstance(when, Condition):
        yield when
    elif isinstance(when, Q):
        for child in when.children:
            yield from iter_conditions(child)


def referenced_fields(when) -> list[str]:
    """The field names a condition reads, in order, without repeats."""
    names = []

    def visit(node):
        if isinstance(node, Condition):
            names.extend(node.fields)
        elif isinstance(node, Q):
            for child in node.children:
                visit(child)
        elif isinstance(node, tuple) and len(node) == 2:
            path, value = node
            names.append(path.split("__")[0])
            if isinstance(value, F):
                names.append(value.name)

    visit(when)

    return list(dict.fromkeys(names))


###
# Evaluation of a serialized tree, mirrored by frontend/src/lib/conditions.ts.
###

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DATETIME = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}")
_TIME = re.compile(r"^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$")
_NUMBER = re.compile(r"^\s*-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$")


def normalize(value):
    """A form value as conditions see it: related objects by id."""
    if isinstance(value, dict) and "id" in value:
        return value["id"]

    if isinstance(value, list):
        return [normalize(item) for item in value]

    return value


def evaluate(
    tree: Optional[dict],
    values: dict[str, Any],
    *,
    now: Optional[datetime.datetime] = None,
    run_condition: Optional[Callable[[dict], Optional[bool]]] = None,
) -> Optional[bool]:
    """
    Whether values meet the tree: True, False, or None when a
    Condition's answer is unknown (run_condition returned None, or none
    was given).
    """
    if tree is None:
        return True

    now = now or timezone.now()

    if timezone.is_naive(now):
        now = timezone.make_aware(now)

    return _evaluate(tree, values, now, run_condition or (lambda leaf: None))


def _evaluate(node, values, now, run_condition) -> Optional[bool]:
    if "condition" in node:
        return run_condition(node)

    if "children" in node:
        results = [
            _evaluate(child, values, now, run_condition) for child in node["children"]
        ]
        connector = node.get("connector", "AND")

        if connector == "OR":
            result = True if True in results else (None if None in results else False)
        elif connector == "XOR":
            result = None if None in results else results.count(True) % 2 == 1
        else:
            result = False if False in results else (None if None in results else True)

        if result is None:
            return None

        return not result if node.get("negated") else result

    return _match(node, values, now)


def _resolve(value, values, now):
    """A tree value, with field references and the current time resolved
    to plain values (instants as aware datetimes)."""
    if isinstance(value, dict):
        if "$field" in value:
            return normalize(values.get(value["$field"]))
        if "$now" in value:
            return now + datetime.timedelta(seconds=value["$now"])
        if "$datetime" in value:
            return _parse_datetime(value["$datetime"])
        if "$date" in value:
            return datetime.date.fromisoformat(value["$date"])
        if "$time" in value:
            return datetime.time.fromisoformat(value["$time"])

    if isinstance(value, list):
        return [_resolve(item, values, now) for item in value]

    return value


def _parse_datetime(text: str) -> datetime.datetime:
    parsed = datetime.datetime.fromisoformat(text.replace("Z", "+00:00"))

    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)

    return parsed


def _temporal(value):
    """A date, datetime or time for a value that is one or reads as an
    ISO 8601 string of one; None otherwise."""
    if isinstance(value, (datetime.date, datetime.time)):
        return value

    if isinstance(value, str):
        try:
            if _DATE.match(value):
                return datetime.date.fromisoformat(value)
            if _DATETIME.match(value):
                return _parse_datetime(value)
            if _TIME.match(value):
                return datetime.time.fromisoformat(value)
        except ValueError:
            return None

    return None


def _local(instant: datetime.datetime) -> datetime.datetime:
    return timezone.localtime(instant)


def _comparable(a, b):
    """
    a and b as values of one kind that compare, or None when they are
    of different kinds: numbers (numeric strings count), instants,
    dates, times, text or booleans.
    """
    if a is None or b is None:
        return None

    if isinstance(a, bool) or isinstance(b, bool):
        return (a, b) if isinstance(a, bool) and isinstance(b, bool) else None

    number_a = _number(a)
    number_b = _number(b)
    if (
        number_a is not None
        and number_b is not None
        and (not isinstance(a, str) or not isinstance(b, str))
    ):
        return number_a, number_b

    temporal_a, temporal_b = _temporal(a), _temporal(b)
    if temporal_a is not None and temporal_b is not None:
        return _same_kind(temporal_a, temporal_b)

    if isinstance(a, str) and isinstance(b, str):
        return a, b

    return None


def _number(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)

    if isinstance(value, str) and _NUMBER.match(value):
        return float(value)

    return None


def _same_kind(a, b):
    """Two temporal values in one kind: an instant compares with a date
    by its local date, and with a time by its local time."""
    a_instant = isinstance(a, datetime.datetime)
    b_instant = isinstance(b, datetime.datetime)

    if a_instant and b_instant:
        return a, b

    if a_instant:
        a = _local(a).date() if isinstance(b, datetime.date) else _local(a).time()
    elif b_instant:
        b = _local(b).date() if isinstance(a, datetime.date) else _local(b).time()

    if isinstance(a, datetime.time) and isinstance(b, datetime.time):
        return a.replace(tzinfo=None), b.replace(tzinfo=None)

    if isinstance(a, datetime.date) and isinstance(b, datetime.date):
        return a, b

    return None


def _equal(a, b) -> bool:
    # An empty text field holds "" once saved and nothing in a new form:
    # both are empty.
    if a in (None, "") and b in (None, ""):
        return True

    if a is None or b is None:
        return False

    pair = _comparable(a, b)

    return pair is not None and pair[0] == pair[1]


def _order(a, b, test) -> bool:
    pair = _comparable(a, b)

    if pair is None or isinstance(pair[0], bool):
        return False

    return test(pair[0], pair[1])


def _text(value) -> Optional[str]:
    if isinstance(value, str):
        return value

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)

    return None


def _match(node, values, now) -> bool:
    lookup = node["lookup"]
    lhs = normalize(values.get(node["field"]))
    rhs = _resolve(node["value"], values, now)

    if lookup == "isnull":
        empty = lhs is None or (isinstance(lhs, list) and not lhs)
        return empty == bool(rhs)

    # Many-to-many fields and lists: a match on any item, the way a
    # many-to-many lookup matches an object with any related object.
    if isinstance(lhs, list):
        return any(_match_one(lookup, item, rhs) for item in lhs)

    return _match_one(lookup, lhs, rhs)


def _match_one(lookup, lhs, rhs) -> bool:
    if lookup == "exact":
        return _equal(lhs, rhs)

    if lookup == "in":
        return any(_equal(lhs, item) for item in rhs or [])

    if lookup == "gt":
        return _order(lhs, rhs, lambda a, b: a > b)

    if lookup == "gte":
        return _order(lhs, rhs, lambda a, b: a >= b)

    if lookup == "lt":
        return _order(lhs, rhs, lambda a, b: a < b)

    if lookup == "lte":
        return _order(lhs, rhs, lambda a, b: a <= b)

    if lookup == "range":
        low, high = rhs
        return _order(lhs, low, lambda a, b: a >= b) and _order(
            lhs, high, lambda a, b: a <= b
        )

    text, other = _text(lhs), _text(rhs)

    if text is None or other is None:
        return False

    if lookup.startswith("i"):
        text, other = text.lower(), other.lower()
        lookup = lookup[1:]

    if lookup == "exact":
        return text == other

    if lookup == "contains":
        return other in text

    if lookup == "startswith":
        return text.startswith(other)

    if lookup == "endswith":
        return text.endswith(other)

    return False
