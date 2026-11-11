from rest_framework.exceptions import ParseError
from rest_framework.parsers import JSONParser


class ObjectJSONParser(JSONParser):
    """
    JSON bodies that are objects. The admin's endpoints read named
    values from the body (request.data.get(...)), so a body that is a
    list, a string, a number or null is a client error, not a crash.
    """

    def parse(self, stream, media_type=None, parser_context=None):
        data = super().parse(stream, media_type, parser_context)

        if not isinstance(data, dict):
            raise ParseError("The request body must be a JSON object.")

        return data
