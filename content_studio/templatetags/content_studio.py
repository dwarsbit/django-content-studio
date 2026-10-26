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
