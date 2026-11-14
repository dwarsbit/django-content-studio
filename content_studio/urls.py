from django.urls import path, re_path

from .media_library.viewsets import MediaLibraryViewSet, MediaFolderViewSet
from .password_links import SetPasswordCheckView, SetPasswordView
from .router import content_studio_router
from .views import ContentStudioWebAppView, AdminApiViewSet

content_studio_router.register("api", AdminApiViewSet, "content_studio_admin")
content_studio_router.register(
    "api/media-library/items", MediaLibraryViewSet, "content_studio_media_library_items"
)
content_studio_router.register(
    "api/media-library/folders",
    MediaFolderViewSet,
    "content_studio_media_library_folders",
)

urlpatterns = [
    # The page that sets a password with an emailed link (an invite, or
    # a link an admin sent): no login, the link's token is the gate.
    path("api/set-password", SetPasswordView.as_view()),
    path("api/set-password/check", SetPasswordCheckView.as_view()),
    re_path(
        "^(?!api).*$", ContentStudioWebAppView.as_view(), name="content_studio_web"
    ),
] + content_studio_router.urls
