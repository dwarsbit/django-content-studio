from django.contrib.auth import get_user_model, authenticate
from django.contrib.auth.signals import user_logged_in, user_login_failed
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.renderers import JSONRenderer
from rest_framework.viewsets import ViewSet


class UsernamePasswordSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True)


class UsernamePasswordViewSet(ViewSet):
    """
    View set for username and password endpoints.
    """

    permission_classes = [AllowAny]
    renderer_classes = [JSONRenderer]

    def create(self, request):
        serializer = UsernamePasswordSerializer(data=request.data)

        serializer.is_valid(raise_exception=True)

        username = serializer.validated_data["username"]
        # The Django request, not DRF's wrapper: authentication backends
        # and signal receivers such as django-axes expect the former.
        django_request = request._request

        user = UsernamePasswordBackend.login(
            username=username,
            password=serializer.validated_data["password"],
            request=django_request,
        )

        # Like the Django admin, only active staff users sign in; any
        # other outcome answers like a wrong password. authenticate()
        # reports its own failures; a user it accepts but the admin does
        # not is reported here, so audit tools see every refused login.
        if user is None or not (user.is_active and user.is_staff):
            if user is not None:
                user_login_failed.send(
                    sender=__name__,
                    credentials={"username": username},
                    request=django_request,
                )

            raise PermissionDenied(detail="Invalid username or password.")

        from ..admin import admin_site

        # The signal Django's login() sends: it updates last_login and
        # tells audit tools about the login.
        user_logged_in.send(sender=user.__class__, request=django_request, user=user)

        return admin_site.token_backend.active_backend.get_response_for_user(
            user, request
        )


class UsernamePasswordBackend:
    name = "Username password"
    view_set = UsernamePasswordViewSet

    @classmethod
    def get_info(cls):
        """
        Returns information about the backend.
        """
        user_model = get_user_model()
        username_field = getattr(user_model, user_model.USERNAME_FIELD, None)

        return {
            "type": cls.__name__,
            "config": {"username_field_type": username_field.field.__class__.__name__},
        }

    @classmethod
    def login(cls, username, password, request=None):
        """
        Authenticates user using username and password.
        Returns the user if successful, None otherwise.
        """
        return authenticate(request, username=username, password=password)
