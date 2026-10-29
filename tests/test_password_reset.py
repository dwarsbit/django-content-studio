"""
Tests for the password reset contrib app.

Codes are generated with secrets, bound to the email on validation, and
invalidated after too many failed attempts.
"""

import pytest
from django.contrib.auth import models as auth_models
from django.core import mail
from django.test import TestCase, override_settings
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


def post(view, data, **extra):
    # Mails are enqueued on commit; run the callbacks like a real commit.
    with TestCase.captureOnCommitCallbacks(execute=True):
        return view.as_view()(
            APIRequestFactory().post("/", data, format="json", **extra)
        )


@pytest.fixture
def user():
    return auth_models.User.objects.create_user(
        username="admin", email="a@example.com", password="old-password", is_staff=True
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

    # The email is locked out after the attempt limit...
    assert PasswordResetCode.objects.get(email="a@example.com").locked

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
@pytest.mark.parametrize(
    "view, field, value",
    [
        (PasswordResetRequestView, "email", "a" * 250 + "@example.com"),
        (CodeValidationView, "email", "a" * 250 + "@example.com"),
        (PasswordResetSubmissionView, "email", "a" * 250 + "@example.com"),
        (PasswordResetSubmissionView, "password", "a" * 4097),
    ],
)
def test_overlong_fields_are_a_client_error(user, view, field, value):
    code = PasswordResetCode.objects.create(email="a@example.com")

    response = post(
        view,
        {
            "email": "a@example.com",
            "code": code.code,
            "password": "new-password-123",
            field: value,
        },
    )

    assert response.status_code == 400
    assert field in response.data
    # Nothing ran: the code was not consumed and no attempt was counted.
    code.refresh_from_db()
    assert code.attempts == 0
    assert len(mail.outbox) == 0


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


@pytest.mark.django_db
def test_new_codes_keep_the_failed_attempts(user):
    post(PasswordResetRequestView, {"email": "a@example.com"})
    for _ in range(MAX_ATTEMPTS - 1):
        post(CodeValidationView, {"code": "000000", "email": "a@example.com"})

    # A fresh code does not reset the count...
    post(PasswordResetRequestView, {"email": "a@example.com"})
    reset = PasswordResetCode.objects.get(email="a@example.com")
    assert reset.attempts == MAX_ATTEMPTS - 1

    # ...so one more wrong guess locks the email out, and no new code is
    # issued while it is.
    post(CodeValidationView, {"code": "000000", "email": "a@example.com"})
    mail.outbox.clear()
    response = post(PasswordResetRequestView, {"email": "a@example.com"})

    assert response.status_code == 202
    assert len(mail.outbox) == 0
    assert PasswordResetCode.objects.get(email="a@example.com").locked


@pytest.mark.django_db
def test_lockout_runs_out(user):
    import datetime

    from django.utils import timezone

    from content_studio.contrib.password_reset.models import LOCKOUT_TIME

    PasswordResetCode.objects.create(email="a@example.com", attempts=MAX_ATTEMPTS)
    PasswordResetCode.objects.update(
        created_at=timezone.now() - datetime.timedelta(minutes=LOCKOUT_TIME + 1)
    )

    post(PasswordResetRequestView, {"email": "a@example.com"})

    reset = PasswordResetCode.objects.get(email="a@example.com")
    assert reset.attempts == 0
    assert len(mail.outbox) == 1


@pytest.mark.django_db
@pytest.mark.parametrize(
    "attrs", [{"is_staff": False}, {"is_active": False}], ids=["non_staff", "inactive"]
)
def test_only_active_staff_users_get_a_code(attrs):
    auth_models.User.objects.create_user(
        username="someone", email="s@example.com", password="x", **attrs
    )

    response = post(PasswordResetRequestView, {"email": "s@example.com"})

    assert response.status_code == 202
    assert not PasswordResetCode.objects.exists()
    assert len(mail.outbox) == 0


@pytest.mark.django_db
def test_shared_emails_get_no_code_and_no_error(user):
    auth_models.User.objects.create_user(
        username="other", email="A@example.com", password="x", is_staff=True
    )

    response = post(PasswordResetRequestView, {"email": "a@example.com"})

    assert response.status_code == 202
    assert not PasswordResetCode.objects.exists()


@pytest.mark.django_db
def test_emails_match_case_insensitively(user):
    post(PasswordResetRequestView, {"email": "A@Example.com"})

    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["a@example.com"]


@pytest.mark.django_db
def test_submission_runs_the_password_validators(user, settings):
    settings.AUTH_PASSWORD_VALIDATORS = [
        {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"}
    ]
    code = PasswordResetCode.objects.create(email="a@example.com")

    response = post(
        PasswordResetSubmissionView,
        {"email": "a@example.com", "code": code.code, "password": "password123"},
    )

    assert response.status_code == 400
    assert "password" in response.data
    user.refresh_from_db()
    assert user.check_password("old-password")


@pytest.mark.django_db
def test_endpoints_are_throttled_per_ip(user, settings):
    settings.CONTENT_STUDIO = {
        **getattr(settings, "CONTENT_STUDIO", {}),
        "PASSWORD_RESET_THROTTLE_RATE": "2/hour",
    }

    statuses = [
        post(PasswordResetRequestView, {"email": "a@example.com"}).status_code
        for _ in range(3)
    ]

    assert statuses == [202, 202, 429]


def reset_requests_from_varying_forwarded_for(count):
    return [
        post(
            PasswordResetRequestView,
            {"email": "a@example.com"},
            REMOTE_ADDR="10.2.2.2",
            HTTP_X_FORWARDED_FOR=f"1.2.3.{i}",
        ).status_code
        for i in range(count)
    ]


@pytest.mark.django_db
def test_spoofed_forwarded_for_does_not_bypass_the_throttle(user, settings):
    settings.CONTENT_STUDIO = {
        **getattr(settings, "CONTENT_STUDIO", {}),
        "PASSWORD_RESET_THROTTLE_RATE": "2/hour",
    }

    assert reset_requests_from_varying_forwarded_for(3) == [202, 202, 429]


@pytest.mark.django_db
def test_forwarded_for_is_honoured_with_num_proxies(user, settings):
    settings.CONTENT_STUDIO = {
        **getattr(settings, "CONTENT_STUDIO", {}),
        "PASSWORD_RESET_THROTTLE_RATE": "2/hour",
    }
    settings.REST_FRAMEWORK = {
        **getattr(settings, "REST_FRAMEWORK", {}),
        "NUM_PROXIES": 1,
    }

    assert reset_requests_from_varying_forwarded_for(3) == [202, 202, 202]


# --- Mails as tasks ----------------------------------------------------------

DEFERRED_TASKS = {"default": {"BACKEND": "django.tasks.backends.dummy.DummyBackend"}}


@pytest.fixture
def deferred_tasks():
    pytest.importorskip("django.tasks")
    from django.tasks import default_task_backend

    with override_settings(TASKS=DEFERRED_TASKS):
        default_task_backend.clear()
        yield default_task_backend
        default_task_backend.clear()


@pytest.mark.django_db
def test_reset_mail_is_enqueued_not_sent_in_the_request(user, deferred_tasks):
    response = post(PasswordResetRequestView, {"email": "a@example.com"})

    assert response.status_code == 202
    # Nothing sent while answering: the response time does not depend on
    # whether the email belongs to an account.
    assert len(mail.outbox) == 0
    [result] = deferred_tasks.results
    assert result.task.name == "send_reset_code"

    # The worker sends the code that is current when it runs.
    result.task.call(*result.args, **result.kwargs)
    assert len(mail.outbox) == 1
    assert PasswordResetCode.objects.get().code in mail.outbox[0].body


@pytest.mark.django_db
def test_unknown_emails_enqueue_nothing(deferred_tasks):
    post(PasswordResetRequestView, {"email": "nobody@example.com"})

    assert deferred_tasks.results == []


@pytest.mark.django_db
def test_a_replaced_code_is_not_sent(user):
    from content_studio.contrib.password_reset.tasks import send_reset_code

    reset = PasswordResetCode.objects.create(email="a@example.com")
    reset.delete()

    send_reset_code.call(reset.pk)

    assert len(mail.outbox) == 0


@pytest.mark.django_db
def test_a_failing_mail_deletes_the_code(user, monkeypatch):
    from content_studio.contrib.password_reset import tasks

    def fail(**kwargs):
        raise ConnectionError("SMTP down")

    monkeypatch.setattr(tasks, "send_mail", fail)
    reset = PasswordResetCode.objects.create(email="a@example.com")

    tasks.send_reset_code.call(reset.pk)

    assert not PasswordResetCode.objects.exists()


@pytest.mark.django_db
def test_mails_use_the_language_of_the_request(user):
    from django.utils import translation

    with translation.override("nl"):
        post(PasswordResetRequestView, {"email": "a@example.com"})

    assert mail.outbox[0].subject != "Your password reset code"


@pytest.mark.django_db
def test_failed_attempts_are_counted_with_stale_records(user):
    """The count is incremented in the database: concurrent attempts
    working on the same record state are all counted."""
    PasswordResetCode.objects.create(email="a@example.com")
    first = PasswordResetCode.objects.get(email="a@example.com")
    second = PasswordResetCode.objects.get(email="a@example.com")

    first.register_failed_attempt()
    second.register_failed_attempt()

    assert PasswordResetCode.objects.get(email="a@example.com").attempts == 2
    assert second.attempts == 2


@pytest.mark.django_db
def test_failed_attempts_survive_atomic_requests(user):
    """With ATOMIC_REQUESTS, an error response must not roll back the
    counted attempt: otherwise codes could be guessed without limit."""
    from django.db import connection, transaction

    PasswordResetCode.objects.create(email="a@example.com")
    original = connection.settings_dict.get("ATOMIC_REQUESTS", False)
    connection.settings_dict["ATOMIC_REQUESTS"] = True

    try:
        for _ in range(MAX_ATTEMPTS):
            # The request's own transaction, as Django's handler opens it.
            with transaction.atomic():
                response = post(
                    CodeValidationView, {"code": "000000", "email": "a@example.com"}
                )
            assert response.status_code == 400
    finally:
        connection.settings_dict["ATOMIC_REQUESTS"] = original

    assert PasswordResetCode.objects.get(email="a@example.com").locked
