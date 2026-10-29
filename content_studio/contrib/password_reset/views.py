from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from django.utils.translation import get_language
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from content_studio.settings import cs_settings
from content_studio.throttling import ClientIPMixin

from .models import MAX_ATTEMPTS, PasswordResetCode, generate_code
from .tasks import send_reset_code, send_reset_confirmation
from .serializers import (
    PasswordResetRequestSerializer,
    CodeValidationSerializer,
    PasswordResetSubmissionSerializer,
)


class PasswordResetRateThrottle(ClientIPMixin, AnonRateThrottle):
    """
    Rate limit for the password reset endpoints, per IP, from the
    CONTENT_STUDIO["PASSWORD_RESET_THROTTLE_RATE"] setting. Like the
    login throttle, the count lives in the cache: configure a shared
    cache when running multiple workers.
    """

    scope = "content_studio_password_reset"

    def get_rate(self):
        return cs_settings.PASSWORD_RESET_THROTTLE_RATE

    def allow_request(self, request, view):
        if not self.rate:
            return True

        return super().allow_request(request, view)


def get_reset_user(email):
    """
    The user a reset for the email applies to: the one active staff user
    with that email (case-insensitive). Anyone else cannot sign in, and an
    email shared by several users is ambiguous, so neither gets a reset.
    """
    users = list(
        get_user_model().objects.filter(
            email__iexact=email, is_active=True, is_staff=True
        )[:2]
    )

    if len(users) != 1:
        return None

    return users[0]


INVALID_CODE = "Invalid code."
EXPIRED_CODE = "Expired code."


def check_code(email, code):
    """
    Check a password reset code for the email: (the code record, None)
    when it matches, (None, the error) otherwise.

    Validation is bound to the email so failed attempts can be counted
    on the code record: after MAX_ATTEMPTS wrong codes the code is
    deleted and a new one has to be requested. Unknown emails and wrong
    codes both get the same error, so the endpoint does not reveal
    whether a code exists for an email.

    The record is locked while it is checked, so concurrent guesses are
    checked one at a time against the attempt limit. The error is
    returned rather than raised: an exception would roll back the
    counted attempt in projects with ATOMIC_REQUESTS.
    """
    with transaction.atomic():
        existing = (
            PasswordResetCode.objects.select_for_update()
            .filter(email__iexact=email)
            .first()
        )

        if (
            not existing
            or existing.locked
            or not existing.code
            or not constant_time_compare(existing.code, code)
        ):
            if existing and not existing.locked:
                existing.register_failed_attempt()
            return None, INVALID_CODE

        if existing.expired:
            existing.delete()
            return None, EXPIRED_CODE

    return existing, None


def code_error_response(error):
    return Response([error], status=status.HTTP_400_BAD_REQUEST)


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetRateThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)

        serializer.is_valid(raise_exception=True)

        user = get_reset_user(serializer.validated_data["email"])

        # 202 whatever happens: the endpoint does not reveal which
        # emails belong to an account.
        if user is None:
            return Response(status=status.HTTP_202_ACCEPTED)

        email = user.email
        existing = PasswordResetCode.objects.filter(email__iexact=email).first()

        if existing and existing.locked:
            return Response(status=status.HTTP_202_ACCEPTED)

        if existing and existing.attempts < MAX_ATTEMPTS:
            # A fresh code, but the failed attempts carry over.
            existing.code = generate_code()
            existing.save(update_fields=["code"])
            PasswordResetCode.objects.filter(pk=existing.pk).update(
                created_at=timezone.now()
            )
            reset = existing
        else:
            # No code yet, or a lockout that has run out.
            PasswordResetCode.objects.filter(email__iexact=email).delete()
            reset = PasswordResetCode.objects.create(email=email)

        # Enqueued, not sent: the response takes as long whether or not
        # the email belongs to an account (see tasks.py). After the commit,
        # so a worker never looks for a code that is not saved yet.
        language = get_language()
        transaction.on_commit(lambda: send_reset_code.enqueue(reset.pk, language))

        return Response(status=status.HTTP_202_ACCEPTED)


class CodeValidationView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetRateThrottle]

    def post(self, request):
        serializer = CodeValidationSerializer(data=request.data)

        serializer.is_valid(raise_exception=True)

        _, error = check_code(
            serializer.validated_data["email"], serializer.validated_data["code"]
        )

        if error:
            return code_error_response(error)

        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetSubmissionView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetRateThrottle]

    def post(self, request):
        serializer = PasswordResetSubmissionSerializer(data=request.data)

        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]

        existing, error = check_code(email, serializer.validated_data["code"])

        if error:
            return code_error_response(error)

        user = get_reset_user(email)

        if not user:
            return code_error_response(INVALID_CODE)

        try:
            validate_password(password, user)
        except DjangoValidationError as e:
            raise ValidationError({"password": list(e.messages)})

        user.set_password(password)

        user.save()

        existing.delete()

        language = get_language()
        transaction.on_commit(
            lambda: send_reset_confirmation.enqueue(user.email, language)
        )

        return Response(status=status.HTTP_204_NO_CONTENT)
