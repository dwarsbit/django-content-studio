"""
The deploy button: a main menu button that triggers webhooks, such as
the build hook of a static site. Add it to the site's extensions
yourself.
"""

from django.utils.translation import gettext_lazy as _
from django.utils.translation import ngettext

from ..extensions import MainMenuButton
from ..settings import cs_settings

__all__ = [
    "DeployButton",
]


class DeployButton(MainMenuButton):
    """
    Triggers the active webhooks (or only those named in webhooks) with
    a webhook.triggered request. With multi-tenancy, the current
    tenant's webhooks and the ones without a tenant are triggered.
    Shown to editors who may change webhooks.
    """

    label = _("Deploy")
    icon = "ph-bold ph-rocket-launch"
    confirm = _("Trigger the webhooks to rebuild the site?")

    def __init__(self, webhooks=None, **kwargs):
        # Set before super().__init__(): get_id_parts() reads it.
        self.webhooks = list(webhooks) if webhooks else None
        super().__init__(**kwargs)

    def get_id_parts(self):
        return (*super().get_id_parts(), *(self.webhooks or ()))

    def is_visible(self, request) -> bool:
        from .models import Webhook

        studio = cs_settings.ADMIN_SITE._registry.get(Webhook)

        return studio is not None and studio.has_change_permission(request)

    def get_webhooks(self, request):
        """The webhooks the button triggers for this request."""
        from django.db.models import Q

        from ..utils import validate_tenant_access
        from .models import Webhook

        webhooks = Webhook.objects.filter(is_active=True)

        if self.webhooks is not None:
            webhooks = webhooks.filter(name__in=self.webhooks)

        if cs_settings.TENANT_MODEL is not None:
            tenant_id = request.headers.get("x-dcs-tenant")
            scope = Q(tenant="")

            if tenant_id:
                validate_tenant_access(request, tenant_id)
                scope |= Q(tenant=str(tenant_id))

            webhooks = webhooks.filter(scope)

        return webhooks.order_by("name")

    def handle(self, request):
        from .delivery import enqueue, trigger

        webhooks = list(self.get_webhooks(request))

        if not webhooks:
            return _("There are no active webhooks to trigger.")

        for webhook in webhooks:
            enqueue(trigger(webhook))

        return ngettext(
            "Triggered %(count)d webhook. Its delivery log shows how it responded.",
            "Triggered %(count)d webhooks. Their delivery logs show how they "
            "responded.",
            len(webhooks),
        ) % {"count": len(webhooks)}
