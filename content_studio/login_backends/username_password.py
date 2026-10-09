from django.contrib.auth import get_user_model, authenticate
from django.utils import timezone
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

        user = UsernamePasswordBackend.login(
            username=serializer.validated_data["username"],
            password=serializer.validated_data["password"],
        )

        if user is None:
            raise PermissionDenied(detail="Invalid username or password.")

        if not user.is_active:
            raise PermissionDenied(detail="User account is disabled.")

        from ..admin import admin_site

        user.last_login = timezone.now()

        user.save()

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
    def login(cls, username, password):
        """
        Authenticates user using username and password.
        Returns the user if successful, None otherwise.
        """
        return authenticate(username=username, password=password)
