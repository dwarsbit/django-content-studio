from rest_framework.permissions import SAFE_METHODS, BasePermission


class ModelAdminPermissions(BasePermission):
    """
    Permission class that delegates to the registered model admin.

    Model-level checks happen in has_permission, per-object checks in
    has_object_permission — the same hooks the Django admin calls, so
    custom per-object permission overrides are enforced. The default
    ModelAdmin implementations check Django's model-level permissions,
    which keeps the out-of-the-box behavior equivalent to
    DjangoModelPermissions.
    """

    def has_permission(self, request, view):
        admin_model = getattr(view, "_admin_model", None)

        if admin_model is None:
            return False

        if request.method in SAFE_METHODS:
            return admin_model.has_view_permission(request)
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
        if request.method in ("PUT", "PATCH"):
            return admin_model.has_change_permission(request, obj)
        if request.method == "DELETE":
            return admin_model.has_delete_permission(request, obj)

        return False
