"""
Tests for the password reset contrib app.

Codes are generated with secrets, bound to the email on validation, and
invalidated after too many failed attempts.
"""

import pytest
from django.contrib.auth import models as auth_models
from django.core import mail
from rest_framework.test import APIRequestFactory

from content_studio.contrib.password_reset.models import (
    MAX_ATTEMPTS,
    PasswordResetCode,
)
from content_studio.contrib.password_reset.views import (
    CodeValidationView,
    PasswordResetRequestView,
    PasswordResetSubmissionView,
)


def post(view, data):
    return view.as_view()(APIRequestFactory().post("/", data, format="json"))


@pytest.fixture
def user():
    return auth_models.User.objects.create_user(
        username="admin", email="a@example.com", password="old-password"
    )


@pytest.mark.django_db
def test_request_creates_code_and_sends_email(user):
    response = post(PasswordResetRequestView, {"email": "a@example.com"})

    assert response.status_code == 202
    assert PasswordResetCode.objects.filter(email="a@example.com").exists()
    assert len(mail.outbox) == 1


@pytest.mark.django_db
def test_request_for_unknown_email_is_accepted_but_creates_nothing():
    response = post(PasswordResetRequestView, {"email": "nobody@example.com"})

    # 202 either way: the endpoint does not reveal which emails exist.
    assert response.status_code == 202
    assert not PasswordResetCode.objects.exists()
    assert len(mail.outbox) == 0


@pytest.mark.django_db
def test_code_validation_requires_the_email(user):
    code = PasswordResetCode.objects.create(email="a@example.com")

    response = post(CodeValidationView, {"code": code.code, "email": "a@example.com"})

    assert response.status_code == 204


@pytest.mark.django_db
def test_wrong_codes_are_counted_and_invalidate_the_code(user):
    code = PasswordResetCode.objects.create(email="a@example.com")

    for _ in range(MAX_ATTEMPTS):
        response = post(
            CodeValidationView, {"code": "000000", "email": "a@example.com"}
        )
        assert response.status_code == 400

    # The code was deleted after the attempt limit...
    assert not PasswordResetCode.objects.exists()

    # ...so even the correct code no longer works.
    response = post(CodeValidationView, {"code": code.code, "email": "a@example.com"})
    assert response.status_code == 400


@pytest.mark.django_db
def test_unknown_email_and_wrong_code_raise_the_same_error(user):
    PasswordResetCode.objects.create(email="a@example.com")

    unknown = post(CodeValidationView, {"code": "123456", "email": "x@example.com"})
    wrong = post(CodeValidationView, {"code": "123456", "email": "a@example.com"})

    assert unknown.status_code == wrong.status_code == 400
    assert unknown.data == wrong.data


@pytest.mark.django_db
def test_submission_resets_the_password(user):
    code = PasswordResetCode.objects.create(email="a@example.com")

    response = post(
        PasswordResetSubmissionView,
        {
            "email": "a@example.com",
            "code": code.code,
            "password": "new-password-123",
        },
    )

    assert response.status_code == 204
    assert not PasswordResetCode.objects.exists()
    user.refresh_from_db()
    assert user.check_password("new-password-123")
    assert len(mail.outbox) == 1  # confirmation email


@pytest.mark.django_db
def test_submission_with_wrong_code_counts_an_attempt(user):
    PasswordResetCode.objects.create(email="a@example.com")

    response = post(
        PasswordResetSubmissionView,
        {
            "email": "a@example.com",
            "code": "000000",
            "password": "new-password-123",
        },
    )

    assert response.status_code == 400
    assert PasswordResetCode.objects.get(email="a@example.com").attempts == 1


@pytest.mark.django_db
def test_codes_are_generated_with_cryptographic_randomness():
    # generate_code must come from secrets, not random.
    import inspect

    from content_studio.contrib.password_reset import models as pr_models

    source = inspect.getsource(pr_models.generate_code)
    assert "secrets" in source
    assert "random" not in source.replace("secrets", "")
