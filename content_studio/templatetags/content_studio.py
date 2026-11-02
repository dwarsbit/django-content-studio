from django import template
from django.utils.safestring import mark_safe

from ..blocks import BlockList, BoundBlock

register = template.Library()


@register.simple_tag(takes_context=True)
def render_blocks(context, blocks):
    """
    Renders the blocks of a BlockField, each with its block's template:

        {% load content_studio %}
        {% render_blocks page.sections %}

    Also takes a list of blocks from BlockList.blocks, such as a slice.
    """
    if isinstance(blocks, BlockList):
        blocks = blocks.blocks
    elif blocks in (None, ""):
        return ""
    elif not all(isinstance(block, BoundBlock) for block in blocks):
        raise TypeError("render_blocks takes the value of a BlockField.")

    engine = context.template.engine
    rendered = []

    for block in blocks:
        block_template = engine.get_template(block.block.get_template_name())

        with context.push(**block.block.get_context(block)):
            rendered.append(block_template.render(context))

    return mark_safe("".join(rendered))


@register.simple_tag
def image_size(item, name):
    """
    One size (IMAGE_SIZES) of a media library image: a dict of url,
    width, height and ready, or None for an unknown size or an item that
    is not an image:

        {% image_size page.cover "card" as card %}
        <img src="{{ card.url }}" width="{{ card.width }}" height="{{ card.height }}">

    A size that is not made yet is the image's own file.
    """
    from ..media_library.sizes import get_image_sizes

    if not item:
        return None

    return get_image_sizes(item).get(name)


@register.simple_tag
def image_url(item, name):
    """
    The URL of one size of a media library image, or "" when there is
    none: {% image_url page.cover "hero" %}.
    """
    size = image_size(item, name)

    return size["url"] if size else ""
