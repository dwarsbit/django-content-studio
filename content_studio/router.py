from rest_framework.routers import DefaultRouter


class ExtendedRouter(DefaultRouter):
    def get_method_map(self, viewset, method_map):
        _method_map = super().get_method_map(viewset, method_map)

        # Singletons allow partial updates: the list route doubles as
        # the singleton's detail route.
        if getattr(viewset, "is_singleton", False):
            _method_map["patch"] = "partial_update"

        return _method_map


content_studio_router = ExtendedRouter(trailing_slash=False)
