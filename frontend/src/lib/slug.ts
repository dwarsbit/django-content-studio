// Slugs as Django makes them (django.utils.text.slugify): accents are
// dropped, anything but letters, digits, underscores, hyphens and
// spaces is removed, and runs of spaces and hyphens become one hyphen.

// Decompose accented letters and drop the accents: "Café" -> "Cafe".
export function stripAccents(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

export function slugify(value: string, maxLength?: number): string {
  // \w is ASCII-only here, so letters without an ASCII form go too.
  let slug = stripAccents(value)
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "-");

  if (maxLength !== undefined) {
    slug = slug.slice(0, maxLength);
  }

  return slug.replace(/^[-_]+|[-_]+$/g, "");
}
