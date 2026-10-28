// Mock data for the prototypes: a small blog, like the demo project.

export interface User {
  id: string;
  name: string;
  username: string;
  initials: string;
}

export const users: Record<string, User> = {
  leon: {
    id: "1",
    name: "Leon van der Grient",
    username: "leon",
    initials: "LG",
  },
  eva: { id: "2", name: "Eva de Jong", username: "eva", initials: "EJ" },
  noah: { id: "3", name: "Noah Bakker", username: "noah", initials: "NB" },
};

export const me = users.leon;

export type ArticleStatus = "published" | "draft" | "review";

export interface Article {
  id: string;
  title: string;
  excerpt: string;
  status: ArticleStatus;
  featured: boolean;
  views: number;
  author: User;
  publishedAt: string | null;
  categories: string[];
}

export const STATUS_LABELS: Record<ArticleStatus, string> = {
  published: "Published",
  draft: "Draft",
  review: "In review",
};

export const articles: Article[] = [
  {
    id: "1",
    title: "Hello, Content Studio",
    excerpt:
      "Why the admin deserves the same care as the site it manages, and what that looks like in practice.",
    status: "published",
    featured: true,
    views: 1284,
    author: users.leon,
    publishedAt: "2 days ago",
    categories: ["General"],
  },
  {
    id: "2",
    title: "A quiet week in the studio",
    excerpt: "Small fixes, a new block type and the first translations.",
    status: "published",
    featured: false,
    views: 318,
    author: users.eva,
    publishedAt: "6 days ago",
    categories: ["Updates"],
  },
  {
    id: "3",
    title: "Tips and tricks for inlines",
    excerpt:
      "Reorder rows with the keyboard, prepopulate slugs and keep forms short.",
    status: "review",
    featured: false,
    views: 42,
    author: users.noah,
    publishedAt: null,
    categories: ["Guides"],
  },
  {
    id: "4",
    title: "Opinion: the admin interface needs a refresh",
    excerpt:
      "The classic admin is twenty years old. That is not a problem, until it is.",
    status: "published",
    featured: true,
    views: 975,
    author: users.eva,
    publishedAt: "9 days ago",
    categories: ["Opinion"],
  },
  {
    id: "5",
    title: "Behind the scenes with Content Studio",
    excerpt:
      "How a registered model turns into a list, a form and a search index.",
    status: "draft",
    featured: false,
    views: 5,
    author: users.leon,
    publishedAt: null,
    categories: ["General", "Guides"],
  },
  {
    id: "6",
    title: "Reviews in order",
    excerpt: "Manual ordering for the things that have an order.",
    status: "draft",
    featured: false,
    views: 0,
    author: users.leon,
    publishedAt: null,
    categories: ["Updates"],
  },
  {
    id: "7",
    title: "Blocks: building a page body from parts",
    excerpt: "Text, image, quote and columns, each with its own template.",
    status: "published",
    featured: false,
    views: 2210,
    author: users.noah,
    publishedAt: "3 weeks ago",
    categories: ["Guides"],
  },
  {
    id: "8",
    title: "Multi-tenancy without the headache",
    excerpt: "One admin, many sites, one tenant header.",
    status: "review",
    featured: false,
    views: 67,
    author: users.eva,
    publishedAt: null,
    categories: ["Opinion"],
  },
];

export interface MenuModel {
  label: string;
  icon: string;
  href: string;
}

export interface MenuGroup {
  label: string;
  icon: string;
  // Starts collapsed in the menu (a studio option; expanded by default).
  collapsed?: boolean;
  models: MenuModel[];
}

// Icons are Phosphor Bold font classes, as configured on a studio.
export const menuGroups: MenuGroup[] = [
  {
    label: "Content",
    icon: "ph-bold ph-article",
    models: [
      {
        label: "Articles",
        icon: "ph-bold ph-article",
        href: "#/content/articles",
      },
      {
        label: "Categories",
        icon: "ph-bold ph-tag",
        href: "#/content/categories",
      },
      {
        label: "Landing pages",
        icon: "ph-bold ph-browser",
        href: "#/content/landing-pages",
      },
      {
        label: "Reviews",
        icon: "ph-bold ph-chat-circle-text",
        href: "#/content/reviews",
      },
    ],
  },
  {
    label: "Site",
    icon: "ph-bold ph-gear",
    models: [
      {
        label: "Site settings",
        icon: "ph-bold ph-sliders",
        href: "#/content/site-settings",
      },
      {
        label: "Redirects",
        icon: "ph-bold ph-arrow-bend-up-right",
        href: "#/content/redirects",
      },
      { label: "Users", icon: "ph-bold ph-users", href: "#/content/users" },
    ],
  },
];

export const tenants = ["Dwarsbit", "Studio blog", "Client site"];

export interface MediaFolder {
  id: string;
  name: string;
  count: number;
  children?: MediaFolder[];
}

export const folders: MediaFolder[] = [
  {
    id: "brand",
    name: "Brand",
    count: 12,
    children: [
      { id: "logos", name: "Logos", count: 4 },
      { id: "photography", name: "Photography", count: 8 },
    ],
  },
  { id: "covers", name: "Blog covers", count: 23 },
  { id: "documents", name: "Documents", count: 5 },
  { id: "uploads", name: "Uploads 2026", count: 41 },
];

export type MediaType = "image" | "video" | "audio" | "file";

export interface MediaItem {
  id: string;
  name: string;
  type: MediaType;
  extension: string;
  size: string;
  dimensions?: string;
  uploadedAt: string;
  tags: string[];
  thumbnail?: string;
}

/**
 * A calm placeholder image in the mist family: a sky, a sun and a few
 * hills, varied by the seed. Data URI, so the prototype needs no assets.
 */
export function placeholder(seed: number, width = 640, height = 480): string {
  const tones = [
    "#e9eced",
    "#dde2e3",
    "#cfd6d8",
    "#b9c2c5",
    "#9ca8ac",
    "#7f8d91",
  ];
  const sky = tones[seed % 2];
  const far = tones[2 + (seed % 2)];
  const near = tones[4 + (seed % 2)];
  const sunX = width * (0.25 + ((seed * 37) % 50) / 100);
  const sunY = height * (0.2 + ((seed * 13) % 25) / 100);
  const ridge = height * (0.45 + ((seed * 7) % 20) / 100);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}'>` +
    `<rect width='100%' height='100%' fill='${sky}'/>` +
    `<circle cx='${sunX}' cy='${sunY}' r='${height * 0.09}' fill='${tones[5]}' opacity='0.5'/>` +
    `<path d='M0 ${height} L0 ${ridge + 40} Q${width * 0.3} ${ridge - 60} ${width * 0.55} ${ridge + 20} T${width} ${ridge - 30} L${width} ${height} Z' fill='${far}'/>` +
    `<path d='M0 ${height} L0 ${ridge + 120} Q${width * 0.35} ${ridge + 30} ${width * 0.6} ${ridge + 110} T${width} ${ridge + 70} L${width} ${height} Z' fill='${near}'/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const imageNames = [
  "studio-desk.jpg",
  "editorial-meeting.jpg",
  "coastline-morning.jpg",
  "print-samples.png",
  "team-portrait.jpg",
  "notebook-sketches.jpg",
  "office-plants.jpg",
  "typewriter-detail.jpg",
];

export const mediaItems: MediaItem[] = [
  ...imageNames.map<MediaItem>((name, index) => ({
    id: `img-${index + 1}`,
    name,
    type: "image",
    extension: name.split(".").pop()!.toUpperCase(),
    size: [
      "1.2 MB",
      "860 KB",
      "2.4 MB",
      "410 KB",
      "3.1 MB",
      "640 KB",
      "1.8 MB",
      "920 KB",
    ][index],
    dimensions: [
      "2400 × 1600",
      "1920 × 1280",
      "3000 × 2000",
      "1200 × 1200",
      "2400 × 1600",
      "1600 × 1200",
      "2000 × 1333",
      "1800 × 1200",
    ][index],
    uploadedAt: [
      "2 hours ago",
      "Yesterday",
      "3 days ago",
      "5 days ago",
      "Last week",
      "2 weeks ago",
      "3 weeks ago",
      "Last month",
    ][index],
    tags: [
      ["studio"],
      ["team", "studio"],
      ["travel"],
      ["print"],
      ["team"],
      [],
      ["studio"],
      ["print"],
    ][index],
    thumbnail: placeholder(index + 1),
  })),
  {
    id: "vid-1",
    name: "launch-teaser.mp4",
    type: "video",
    extension: "MP4",
    size: "48 MB",
    uploadedAt: "Yesterday",
    tags: ["marketing"],
  },
  {
    id: "aud-1",
    name: "interview-leon.m4a",
    type: "audio",
    extension: "M4A",
    size: "22 MB",
    uploadedAt: "4 days ago",
    tags: ["podcast"],
  },
  {
    id: "doc-1",
    name: "brand-guidelines.pdf",
    type: "file",
    extension: "PDF",
    size: "6.3 MB",
    uploadedAt: "Last week",
    tags: ["brand"],
  },
  {
    id: "doc-2",
    name: "press-kit.zip",
    type: "file",
    extension: "ZIP",
    size: "112 MB",
    uploadedAt: "Last month",
    tags: ["brand", "marketing"],
  },
];

export interface ActivityEntry {
  id: string;
  user: User;
  action: "created" | "changed" | "deleted";
  object: string;
  model: string;
  when: string;
}

export const activity: ActivityEntry[] = [
  {
    id: "a1",
    user: users.eva,
    action: "changed",
    object: "A quiet week in the studio",
    model: "Article",
    when: "12 minutes ago",
  },
  {
    id: "a2",
    user: users.leon,
    action: "created",
    object: "Blocks: building a page body from parts",
    model: "Article",
    when: "1 hour ago",
  },
  {
    id: "a3",
    user: users.noah,
    action: "changed",
    object: "Site settings",
    model: "Site settings",
    when: "3 hours ago",
  },
  {
    id: "a4",
    user: users.eva,
    action: "deleted",
    object: "Untitled draft",
    model: "Article",
    when: "Yesterday",
  },
  {
    id: "a5",
    user: users.leon,
    action: "changed",
    object: "Guides",
    model: "Category",
    when: "Yesterday",
  },
  {
    id: "a6",
    user: users.noah,
    action: "created",
    object: "press-kit.zip",
    model: "Media item",
    when: "2 days ago",
  },
];

export interface ScheduledTask {
  title: string;
  description: string;
  status: "RUNNING" | "SCHEDULED" | "SUCCESS" | "FAILURE";
  lastRun: string | null;
  duration: string | null;
  nextRun: string | null;
  error?: string;
}

export const tasks: ScheduledTask[] = [
  {
    title: "Publish scheduled articles",
    description: "Every 5 minutes",
    status: "SUCCESS",
    lastRun: "3 minutes ago",
    duration: "0.4s",
    nextRun: "in 2 minutes",
  },
  {
    title: "Rebuild search index",
    description: "Nightly at 02:00",
    status: "RUNNING",
    lastRun: "just now",
    duration: null,
    nextRun: null,
  },
  {
    title: "Send newsletter digest",
    description: "Mondays at 08:00",
    status: "FAILURE",
    lastRun: "6 hours ago",
    duration: "12s",
    nextRun: "in 7 days",
    error: "SMTP connection refused (mail.example.com:587)",
  },
];

export const reviews = [
  {
    id: "r1",
    reviewer: "Marieke",
    rating: 5,
    text: "Clear and to the point. Exactly what I needed to get started.",
    when: "3 days ago",
  },
  {
    id: "r2",
    reviewer: "Tom",
    rating: 4,
    text: "Good overview, would love a section on permissions.",
    when: "5 days ago",
  },
  {
    id: "r3",
    reviewer: "Sanne",
    rating: 5,
    text: "The comparison with the classic admin is spot on.",
    when: "Last week",
  },
];
