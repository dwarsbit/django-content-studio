# Slider

Picks a number in a range by dragging a thumb along a track, such as a rating, an opacity or a discount. The filled part of the track is `primary`.

Use it when the exact number matters less than where it sits in the range, and show the value next to it. For precise numbers, use an Input. The consumer provides `min`, `max`, `step` and a `value`/`onValueChange` pair of number arrays (one number per thumb). Arrow keys move the thumb by one step.
