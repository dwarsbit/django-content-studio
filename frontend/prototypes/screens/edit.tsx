// The edit page: one object's form, with the fields in the main column
// and the metadata in the sidebar. With `create`, the empty create form.
import { useState } from "react";
import {
  PiArrowLeftBold,
  PiCalendarBlankBold,
  PiClockCounterClockwiseBold,
  PiDotsSixVerticalBold,
  PiDotsThreeBold,
  PiEyeBold,
  PiImageBold,
  PiImagesBold,
  PiLinkBold,
  PiListBulletsBold,
  PiListNumbersBold,
  PiPlusBold,
  PiQuotesBold,
  PiStarBold,
  PiStarFill,
  PiTextBBold,
  PiTextHOneBold,
  PiTextItalicBold,
  PiTextUnderlineBold,
  PiUploadSimpleBold,
  PiXBold,
} from "react-icons/pi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { usePrototype } from "../app";
import {
  Field,
  FormSetCard,
  GroupTextInput,
  LineTabsList,
  LineTabsTrigger,
  PageBody,
  PageHeader,
  SharedBanner,
  StatusBadge,
  TextInput,
  UserAvatar,
} from "../components";
import {
  activity,
  articles,
  placeholder,
  reviews,
  STATUS_LABELS,
  users,
} from "../data";

const article = articles[0];

export function EditScreen({ create = false }: { create?: boolean }) {
  const { settings } = usePrototype();
  const dirty = !create && settings.editDirty;

  return (
    <>
      {settings.tenant && <SharedBanner noun="articles" />}
      <PageHeader
        back={
          <Button
            variant="ghost"
            size="icon-sm"
            className="-ml-2 text-muted-foreground"
            aria-label="Back to articles"
            onClick={() => (window.location.hash = "#/content/articles")}
          >
            <PiArrowLeftBold />
          </Button>
        }
        title={
          <span className="flex items-center gap-1.5 min-w-0">
            <a
              href="#/content/articles"
              className="text-muted-foreground hover:text-foreground font-medium shrink-0"
            >
              Articles
            </a>
            <span className="text-muted-foreground/50 shrink-0">/</span>
            <span className="truncate">
              {create ? "New article" : article.title}
            </span>
          </span>
        }
        meta={!create && <StatusBadge status={article.status} />}
        actions={
          create ? (
            <Button className="min-w-20">Create</Button>
          ) : (
            <>
              <span className="hidden lg:flex items-center gap-1.5 text-sm text-muted-foreground mr-2">
                {dirty ? (
                  <>
                    <span className="size-1.5 rounded-full bg-warning" />
                    Unsaved changes
                  </>
                ) : (
                  "Edited 2 days ago by Eva"
                )}
              </span>
              <Button variant="outline">
                <PiEyeBold />
                Preview
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More actions">
                    <PiDotsThreeBold />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Duplicate</DropdownMenuItem>
                  <DropdownMenuItem>
                    History
                    <PiClockCounterClockwiseBold />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">
                    Move to trash
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button className="min-w-20">Save</Button>
            </>
          )
        }
      />

      <PageBody>
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 min-w-0 w-full">
            <Tabs defaultValue="general">
              <LineTabsList className="mb-5">
                <LineTabsTrigger value="general">General</LineTabsTrigger>
                <LineTabsTrigger value="seo">SEO</LineTabsTrigger>
                {!create && (
                  <LineTabsTrigger value="reviews" count={reviews.length}>
                    Reviews
                  </LineTabsTrigger>
                )}
                {create && (
                  <span className="ml-auto self-center text-xs text-muted-foreground pb-1.5">
                    Reviews can be added once the article exists.
                  </span>
                )}
              </LineTabsList>

              <TabsContent value="general" className="space-y-5">
                <FormSetCard title="Content" description="The article itself">
                  <Field label="title" required>
                    <TextInput
                      initial={create ? "" : article.title}
                      placeholder={
                        create ? "The title of the article" : undefined
                      }
                    />
                  </Field>
                  <Field
                    label="slug"
                    hint="Follows the title until you edit it yourself."
                  >
                    <InputGroup>
                      <InputGroupAddon>
                        <InputGroupText>/blog/</InputGroupText>
                      </InputGroupAddon>
                      <GroupTextInput
                        initial={create ? "" : "hello-content-studio"}
                        placeholder={
                          create ? "the-title-of-the-article" : undefined
                        }
                      />
                    </InputGroup>
                  </Field>
                  <Field label="body">
                    <RichText empty={create} />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="status">
                      <Select defaultValue={create ? "draft" : "published"}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABELS).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="categories">
                      <Chips
                        values={create ? [] : ["General", "Guides"]}
                        placeholder="Add a category"
                      />
                    </Field>
                  </div>
                  <Field label="cover">
                    {create ? <EmptyMediaPicker /> : <MediaPicker />}
                  </Field>
                </FormSetCard>
              </TabsContent>

              <TabsContent value="seo" className="space-y-5">
                <FormSetCard
                  title="Search engines"
                  description="What search results show for this article"
                >
                  <Field label="meta title" hint="Defaults to the title.">
                    <TextInput initial={create ? "" : article.title} />
                  </Field>
                  <Field label="meta description" hint="Up to 160 characters.">
                    <textarea
                      className="w-full min-h-20 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring placeholder:text-muted-foreground"
                      defaultValue={create ? "" : article.excerpt}
                      placeholder={create ? "One or two sentences" : undefined}
                    />
                  </Field>
                </FormSetCard>
              </TabsContent>

              {!create && (
                <TabsContent value="reviews">
                  <ReviewsInline />
                </TabsContent>
              )}
            </Tabs>
          </div>

          <aside className="w-full lg:w-[300px] shrink-0 space-y-4">
            <FormSetCard>
              <Field label="published at">
                <InputGroup>
                  <GroupTextInput
                    initial={create ? "" : "26 Oct 2026, 08:56"}
                    placeholder={create ? "Not scheduled" : undefined}
                  />
                  <InputGroupAddon align="inline-end">
                    <PiCalendarBlankBold className="text-muted-foreground" />
                  </InputGroupAddon>
                </InputGroup>
              </Field>
              <Field label="author">
                <Select defaultValue="leon">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(users).map((user) => (
                      <SelectItem key={user.id} value={user.username}>
                        <span className="flex items-center gap-2">
                          <UserAvatar user={user} className="size-5" />
                          {user.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <Checkbox defaultChecked={!create} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium leading-tight">
                    Featured
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Shown on the home page.
                  </span>
                </span>
              </label>
              {!create && (
                <Field label="views" hint="Read-only">
                  <div className="h-9 flex items-center px-3 rounded-md border border-dashed bg-muted/40 text-sm tabular-nums text-muted-foreground">
                    {article.views.toLocaleString("en")}
                  </div>
                </Field>
              )}
            </FormSetCard>

            {!create && (
              <FormSetCard title="Activity" flush>
                <ul className="divide-y">
                  {activity.slice(0, 4).map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-start gap-2.5 px-5 py-2.5"
                    >
                      <UserAvatar user={entry.user} className="mt-0.5" />
                      <div className="min-w-0 text-sm">
                        <div>
                          <span className="font-medium">
                            {entry.user.name.split(" ")[0]}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            {entry.action} this article
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {entry.when}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </FormSetCard>
            )}
          </aside>
        </div>
      </PageBody>
    </>
  );
}

function RichText({ empty }: { empty?: boolean }) {
  const tools = [
    [PiTextHOneBold, "Heading"],
    [PiTextBBold, "Bold"],
    [PiTextItalicBold, "Italic"],
    [PiTextUnderlineBold, "Underline"],
    [PiLinkBold, "Link"],
    [PiListBulletsBold, "Bullet list"],
    [PiListNumbersBold, "Numbered list"],
    [PiQuotesBold, "Quote"],
    [PiImageBold, "Image"],
  ] as const;

  return (
    <div className="rounded-md border bg-background focus-within:border-ring">
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b">
        {tools.map(([Icon, label], index) => (
          <Button
            key={label}
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            className={cn(
              "text-muted-foreground",
              !empty && index === 1 && "bg-accent text-foreground",
            )}
          >
            <Icon />
          </Button>
        ))}
      </div>
      <div className="px-3 py-2.5 text-sm space-y-3 min-h-40 leading-relaxed">
        {empty ? (
          <p className="text-muted-foreground">Write the article…</p>
        ) : (
          <>
            <p>
              <strong>Content Studio</strong> manages the models you already
              have. Register a model and it is manageable: a list, a form and a
              search index, with nothing to migrate.
            </p>
            <p>
              The admin is a calm, neutral workspace, so the content stays the
              loudest thing on screen. This article walks through the first
              week.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Chips({
  values,
  placeholder: text,
}: {
  values: string[];
  placeholder: string;
}) {
  return (
    <div className="min-h-9 flex items-center flex-wrap gap-1.5 rounded-md border bg-background px-2 py-1.5 focus-within:border-ring">
      {values.map((value) => (
        <Badge key={value} variant="secondary" className="gap-1 pr-1">
          {value}
          <button
            type="button"
            aria-label={`Remove ${value}`}
            className="rounded-full hover:bg-foreground/10 p-0.5 cursor-pointer"
          >
            <PiXBold className="size-2.5" />
          </button>
        </Badge>
      ))}
      <input
        className="flex-1 min-w-24 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        placeholder={text}
      />
    </div>
  );
}

function MediaPicker() {
  return (
    <div className="flex items-center gap-3 rounded-md border bg-background p-2 pr-3">
      <img
        src={placeholder(3, 320, 240)}
        alt=""
        className="size-14 rounded object-cover shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">coastline-morning.jpg</div>
        <div className="text-xs text-muted-foreground">
          JPG · 2.4 MB · 3000 × 2000
        </div>
      </div>
      <Button variant="outline" size="sm">
        Replace
      </Button>
      <Button variant="ghost" size="sm" className="text-muted-foreground">
        Remove
      </Button>
    </div>
  );
}

function EmptyMediaPicker() {
  return (
    <div className="flex items-center gap-3 rounded-md border border-dashed bg-background p-2 pr-3">
      <span className="size-14 rounded bg-muted flex items-center justify-center text-muted-foreground shrink-0">
        <PiImagesBold className="size-5" />
      </span>
      <div className="flex-1 min-w-0 text-sm text-muted-foreground">
        No cover yet.
      </div>
      <Button variant="outline" size="sm">
        <PiImagesBold />
        Choose
      </Button>
      <Button variant="ghost" size="sm" className="text-muted-foreground">
        <PiUploadSimpleBold />
        Upload
      </Button>
    </div>
  );
}

type Review = (typeof reviews)[number];

function ReviewsInline() {
  // The review being edited in the dialog, "new" for a new one.
  const [open, setOpen] = useState<Review | "new" | null>(null);

  return (
    <>
      <FormSetCard
        title="Reviews"
        description="Drag rows to change their order."
        flush
        actions={
          <Button variant="outline" size="sm" onClick={() => setOpen("new")}>
            <PiPlusBold />
            Add review
          </Button>
        }
      >
        <div className="overflow-x-auto scrollbar">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr className="border-b">
                <th className="w-10 h-10" />
                <th className="text-left font-medium px-2">Reviewer</th>
                <th className="text-left font-medium px-2 w-28">Rating</th>
                <th className="text-left font-medium px-2">Review</th>
                <th className="text-left font-medium px-2 w-28">Added</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {reviews.map((review) => (
                <tr
                  key={review.id}
                  className="hover:bg-muted cursor-pointer h-11"
                  onClick={() => setOpen(review)}
                >
                  <td
                    className="pl-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      aria-label="Drag to reorder"
                      className="size-6 inline-flex items-center justify-center rounded-md text-muted-foreground cursor-grab hover:bg-foreground/5"
                    >
                      <PiDotsSixVerticalBold />
                    </button>
                  </td>
                  <td className="px-2 font-medium">{review.reviewer}</td>
                  <td className="px-2">
                    <Stars value={review.rating} />
                  </td>
                  <td className="px-2 max-w-sm truncate text-muted-foreground">
                    {review.text}
                  </td>
                  <td className="px-2 text-muted-foreground whitespace-nowrap">
                    {review.when}
                  </td>
                  <td
                    className="pr-3 text-right"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Row actions"
                      className="text-muted-foreground"
                    >
                      <PiDotsThreeBold />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FormSetCard>

      <ReviewDialog review={open} onClose={() => setOpen(null)} />
    </>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span
      className="inline-flex gap-0.5 text-foreground"
      aria-label={`${value} of 5`}
    >
      {Array.from({ length: 5 }).map((_, index) =>
        index < value ? (
          <PiStarFill key={index} className="size-3.5" />
        ) : (
          <PiStarBold
            key={index}
            className="size-3.5 text-muted-foreground/40"
          />
        ),
      )}
    </span>
  );
}

/**
 * The inline row editor: the same editor in a dialog, with the header
 * carrying the breadcrumb and the actions, as the page does.
 */
function ReviewDialog({
  review,
  onClose,
}: {
  review: Review | "new" | null;
  onClose(): void;
}) {
  const isNew = review === "new";
  const current = review && review !== "new" ? review : null;

  return (
    <Dialog open={review !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-[640px] p-0 gap-0 overflow-hidden"
        showCloseButton={false}
      >
        <div className="h-14 px-5 flex items-center gap-3 border-b">
          <div className="min-w-0 flex-1 flex items-center gap-1.5">
            <span className="text-muted-foreground font-medium">Reviews</span>
            <span className="text-muted-foreground/50">/</span>
            <DialogTitle className="text-base font-semibold truncate">
              {isNew ? "New review" : current?.reviewer}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {isNew ? "Add a review to this article." : "Edit the review."}
            </DialogDescription>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button className="min-w-20" onClick={onClose}>
            {isNew ? "Create" : "Save"}
          </Button>
        </div>
        {/* Keyed per review, so the form starts from that review's values. */}
        <ReviewForm key={current?.id ?? "new"} review={current} />
      </DialogContent>
    </Dialog>
  );
}

function ReviewForm({ review }: { review: Review | null }) {
  const [rating, setRating] = useState(review?.rating ?? 0);

  return (
    <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto scrollbar">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="reviewer" required>
          <TextInput initial={review?.reviewer ?? ""} placeholder="Name" />
        </Field>
        <Field label="rating">
          <div className="h-9 flex items-center gap-1 px-2 rounded-md border bg-background">
            {Array.from({ length: 5 }).map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`${index + 1} of 5`}
                aria-pressed={index < rating}
                className="rounded-sm p-0.5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setRating(index + 1)}
              >
                {index < rating ? (
                  <PiStarFill className="size-4" />
                ) : (
                  <PiStarBold className="size-4 text-muted-foreground/50" />
                )}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <Field label="review" required>
        <textarea
          className="w-full min-h-28 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring placeholder:text-muted-foreground"
          defaultValue={review?.text ?? ""}
          placeholder="What did the reader think?"
        />
      </Field>
      <Field label="article">
        <div className="h-9 flex items-center px-3 rounded-md border border-dashed bg-muted/40 text-sm text-muted-foreground">
          {article.title}
        </div>
      </Field>
    </div>
  );
}
