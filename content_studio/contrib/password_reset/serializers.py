from rest_framework import serializers

from content_studio.utils import MAX_PASSWORD_LENGTH

# The length of an email address, like Django's EmailField.
MAX_EMAIL_LENGTH = 254


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=MAX_EMAIL_LENGTH)


class CodeValidationSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6)
    email = serializers.EmailField(max_length=MAX_EMAIL_LENGTH)


class PasswordResetSubmissionSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6)
    email = serializers.EmailField(max_length=MAX_EMAIL_LENGTH)
    password = serializers.CharField(min_length=8, max_length=MAX_PASSWORD_LENGTH)
