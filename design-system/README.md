Django Content Studio is a modern alternative to the classic Django admin. Its admin is a calm, neutral workspace: one cool gray family, one typeface, soft shadows and generous radii, so editors' content stays the loudest thing on screen. Build every screen from the tokens and components below.

## Content fundamentals

- **Voice**: plain and precise. Address the reader as "you"; never "we". No exclamation marks, no hype ("simply", "easy", "powerful").
- **Casing**: sentence case everywhere: buttons, menu items, headings, dialog titles ("Delete this article?", "Copy URL", "Media library").
- **Buttons are verbs** that say what happens: "Save", "Delete", "Log out". Confirmations name the result: "Changes saved".
- **Errors** say what went wrong and what to do next, without apologies: "SVG files are not accepted. Upload a PNG or JPEG instead."
- **Words**: the product's interface is "the admin"; the people in it are "editors"; "log in" and "log out" (not "sign in").
- **Emoji**: none in interface copy. The one exception in the admin today is the wave in the dashboard greeting ("Good morning, Leon 👋").
- The admin ships in English and Dutch; keep labels short enough to survive translation.

## Visual foundations

### Color

- The palette is one cool gray family, the mist scale (`color-gray-50` to `color-gray-950`), with no brand hue. Use the semantic tokens, never the scale directly: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `border`, `input`, `ring`.
- `primary` is the ink of the interface: near-black in light, near-white in dark. Give each view one `primary` button; text on it is `primary-foreground`.
- Body text is `foreground` on `background` or `card`. Supporting text (placeholders, hints, metadata) is `muted-foreground`, which holds 4.5:1 on `background`, `card` and `muted` in both themes.
- `destructive`, `success` and `warning` mean status, nothing else, and always come with a word. All three hold 4.5:1 on `background` in both themes.
- The main menu has its own set: `sidebar`, `sidebar-foreground`, `sidebar-accent`, `sidebar-primary`, all in the mist family.
- Charts use `chart-1` to `chart-5`, a mist ramp from light to dark.
- Both themes are complete: every color token has a light and a dark value. Theme the page with `data-theme="light"` or `data-theme="dark"` on the root element.

### Type

- One family: Inter Variable (`--font-sans`), weights 100–900 from one file. Body text is `body` (13px); headings are semibold (600); buttons and labels use weight 500.
- Use the scale: `small` 12px for metadata and badges, `body` 13px for nearly everything, `body-large` 14px for page headers and menu labels, `title-small` 18px for dialog titles, `title` 24px for page titles, `display` 28px for the dashboard greeting and statistics. Line height is 1.5 throughout.
- Numbers that line up in columns use tabular figures.

### Space, shape and depth

- Space comes from a 4px unit (`spacing`): `space-2` (8px) between controls, `space-3` (12px) inside buttons and inputs, `space-4` (16px) inside cards, `space-6` (24px) around sections.
- Radii derive from `radius` (10px): `radius-sm` for checkboxes and badges, `radius-md` for inputs and menus, `radius-lg` for buttons, cards and dialogs. Switches, avatars and pills are fully round.
- Borders are 1px hairlines in `border` (`input` for form controls). Separate areas with borders and `muted` fills before reaching for shadows.
- Shadows are soft and tinted with the mist hue: `shadow-xs` on buttons, checkboxes and switches, `shadow-sm` on inputs, `shadow-md` on cards and popovers, `shadow-lg` on menus and toasts, `shadow-xl` on dialogs and the login card.
- Focus is a solid 3px ring in `ring` with a `ring` border, at least 3:1 on every surface in both themes. Never remove it; style focus with `focus-visible` so mouse clicks stay quiet.

### Layout and motion

- The admin is a main menu on the left (`sidebar`) and a content area capped at 1280px. The dashboard is a grid of up to four columns of widgets on `card`.
- Edit pages put the fields in a main column and metadata in a narrower sidebar; form sets are cards.
- Motion is short and functional: overlays fade and zoom in, menus slide a few pixels. Nothing loops, nothing bounces.

## Iconography

- Icons are Phosphor, bold weight. Components use them as React icons; configurable icons (a model's menu icon, a bulk action, a menu link) are Phosphor Bold font classes written `ph-bold ph-<name>`, such as `ph-bold ph-article`.
- Default icon size is 16px (`size-4`), in the text color of the control, at 50% opacity for affordances such as a select's caret.
- Icon-only buttons need an `aria-label` and usually a Tooltip.

## Components

The `ContentStudio` bundle holds the admin's own components: 34 of them, from Button and Input to Command, Sheet and Toaster, grouped as actions, forms, display, navigation, overlays and feedback. Each has guidelines and a live preview; use them instead of restyling native elements. The bundle runs on React 18, where a component does not receive a `ref` through `asChild`: give a Radix trigger `buttonVariants(...)` as its class instead of wrapping a `Button`.

## Source and build

This system lives in `design-system/` in the repository and is built from the admin itself: the components are `frontend/src/components/ui`, the color values come from `frontend/src/index.css`. After changing either, run `npm run build:design-system` in `frontend/`: it updates the color values in `tokens.json` (the usage notes stay as written), rebuilds `components/bundle.js` and `bundle.css`, and copies the font and logos. A new component needs an export in `frontend/design-system/entry.tsx`, an entry in `COMPONENTS` in `frontend/design-system/build.mjs` and a folder here with a `README.md` and a `preview.html`; `npm run build:design-system -- --check`, which CI runs, reports what is missing.
