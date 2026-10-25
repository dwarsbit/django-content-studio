from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsActiveStaff(BasePermission):
    """
    The Django admin's gate: an authenticated, active staff user. Every
    Content Studio endpoint that is not part of signing in requires it.
    """

    def has_permission(self, request, view):
        user = getattr(request, "user", None)

        return bool(user and user.is_authenticated and user.is_active and user.is_staff)


class ModelStudioPermissions(BasePermission):
    """
    Permission class that delegates to the registered model studio.

    Model-level checks happen in has_permission, per-object checks in
    has_object_permission — the same hooks the model studio exposes, so
    custom per-object permission overrides are enforced. The default
    implementations check Django's model-level permissions, which keeps
    the out-of-the-box behavior equivalent to DjangoModelPermissions.
    """

    def has_permission(self, request, view):
        admin_model = getattr(view, "_admin_model", None)

        if admin_model is None:
            return False

        if request.method in SAFE_METHODS:
            return admin_model.has_view_permission(request)

        if getattr(view, "action", None) == "bulk":
            # The bulk endpoint enforces its own per-action permissions
            # (see actions.get_bulk_actions); seeing the list is the
            # only gate here.
            return admin_model.has_view_permission(request)

        if getattr(view, "action", None) == "get_related_objects":
            # The relation picker is a read (POST only for its payload):
            # it serves the list filters and both the create and edit
            # forms. The endpoint also requires view permission on the
            # related model.
            return admin_model.has_view_permission(
                request
            ) or admin_model.has_add_permission(request)

        if getattr(view, "action", None) in ("restore", "move"):
            # Restoring a trashed object and moving one to another
            # position are changes, whatever the HTTP method.
            return admin_model.has_change_permission(request)

        if request.method == "POST":
            return admin_model.has_add_permission(request)

        if request.method in ("PUT", "PATCH"):
            return admin_model.has_change_permission(request)

        if request.method == "DELETE":
            return admin_model.has_delete_permission(request)

        return False

    def has_object_permission(self, request, view, obj):
        admin_model = getattr(view, "_admin_model", None)

        if admin_model is None:
            return False

        if request.method in SAFE_METHODS:
            return admin_model.has_view_permission(request, obj)

        if getattr(request, "method", None) == "POST" and getattr(
            view, "action", None
        ) in ("restore", "move"):
            return admin_model.has_change_permission(request, obj)

        if request.method in ("PUT", "PATCH"):
            return admin_model.has_change_permission(request, obj)

        if request.method == "DELETE":
            return admin_model.has_delete_permission(request, obj)

        return False
