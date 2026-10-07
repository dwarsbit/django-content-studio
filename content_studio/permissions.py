from inspect import signature

from rest_framework.permissions import SAFE_METHODS, BasePermission


def _takes_obj(permission_method):
    """
    Inline model admins require the obj argument on their permission
    methods; regular model admins do not accept it.
    """
    return "obj" in signature(permission_method).parameters


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
            if _takes_obj(admin_model.has_add_permission):
                return admin_model.has_add_permission(request, None)
            return admin_model.has_add_permission(request)

        if request.method in ("PUT", "PATCH"):
            if _takes_obj(admin_model.has_change_permission):
                return admin_model.has_change_permission(request, None)
            return admin_model.has_change_permission(request)

        if request.method == "DELETE":
            if _takes_obj(admin_model.has_delete_permission):
                return admin_model.has_delete_permission(request, None)
            return admin_model.has_delete_permission(request)

        return False

    def has_object_permission(self, request, view, obj):
        admin_model = getattr(view, "_admin_model", None)

        if admin_model is None:
            return False

        if request.method in SAFE_METHODS:
            return admin_model.has_view_permission(request, obj)

        if request.method in ("PUT", "PATCH"):
            if _takes_obj(admin_model.has_change_permission):
                return admin_model.has_change_permission(request, obj)
            return admin_model.has_change_permission(request)

        if request.method == "DELETE":
            if _takes_obj(admin_model.has_delete_permission):
                return admin_model.has_delete_permission(request, obj)
            return admin_model.has_delete_permission(request, obj)

        return False
