import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FormatRenderer } from "@/components/formats/renderer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RelationOption } from "@/components/widgets/relation-option";
import { WidgetRenderer } from "@/components/widgets/renderer";
import { useHttp } from "@/hooks/use-http";
import {
  FieldFormat,
  FieldType,
  FieldWidget,
  type Model,
  type ModelField,
  type Resource,
} from "@/types";

const WIDGET_FIXTURES: Record<string, { field: ModelField; value: unknown }> = {
  "Char field (InputWidget)": {
    field: { type: FieldType.CharField, widget_class: FieldWidget.InputWidget },
    value: "Hello, studio",
  },
  "Text field (TextAreaWidget)": {
    field: {
      type: FieldType.TextField,
      widget_class: FieldWidget.TextAreaWidget,
    },
    value: "A longer body of text.",
  },
  "Boolean field (CheckboxWidget)": {
    field: {
      type: FieldType.BooleanField,
      widget_class: FieldWidget.CheckboxWidget,
    },
    value: true,
  },
  "Choice field (SelectWidget)": {
    field: {
      type: FieldType.CharField,
      choices: [
        ["draft", "Draft"],
        ["published", "Published"],
      ],
      widget_class: FieldWidget.SelectWidget,
    },
    value: "draft",
  },
  "Multiple choice field (MultiSelectWidget)": {
    field: {
      type: FieldType.CharField,
      multiple: true,
      choices: [
        ["news", "News"],
        ["tutorials", "Tutorials"],
        ["opinion", "Opinion"],
      ],
      widget_class: FieldWidget.MultiSelectWidget,
    },
    value: ["news"],
  },
  "Date field (DateWidget)": {
    field: {
      type: FieldType.DateField,
      widget_class: FieldWidget.DateWidget,
    },
    value: "2026-10-09",
  },
  "Date-time field (DateTimeWidget)": {
    field: {
      type: FieldType.DateTimeField,
      widget_class: FieldWidget.DateTimeWidget,
    },
    value: "2026-10-09T12:30:00",
  },
  "Time field (TimeWidget)": {
    field: {
      type: FieldType.TimeField,
      widget_class: FieldWidget.TimeWidget,
    },
    value: "12:30",
  },
  "Slug field (SlugWidget)": {
    field: {
      type: FieldType.SlugField,
      widget_class: FieldWidget.SlugWidget,
    },
    value: "my-first-article",
  },
  "Tag field (TagWidget)": {
    field: {
      type: FieldType.CharField,
      widget_class: FieldWidget.TagWidget,
    },
    value: ["django", "admin"],
  },
  "URL path field (URLPathWidget)": {
    field: {
      type: FieldType.URLPathField,
      widget_class: FieldWidget.URLPathWidget,
    },
    value: "/docs/getting-started",
  },
  "JSON field (JSONSchemaWidget)": {
    field: {
      type: FieldType.CharField,
      json_schema: { heading: "string", level: "number" },
      widget_class: FieldWidget.JSONSchemaWidget,
    },
    value: { heading: "Widgets", level: 1 },
  },
  "Rich text field (RichTextWidget)": {
    field: {
      type: FieldType.HTMLField,
      widget_class: FieldWidget.RichTextWidget,
    },
    value: "<p>Edit me with the rich text toolbar.</p>",
  },
};

const FORMAT_FIXTURES: Record<string, { field?: ModelField; value: unknown }> =
  {
    "TextFormat (CharField)": {
      field: { type: FieldType.CharField },
      value: "Hello, studio",
    },
    "NumberFormat (IntegerField)": {
      field: { type: FieldType.IntegerField },
      value: 1234,
    },
    "BooleanFormat (BooleanField)": {
      field: { type: FieldType.BooleanField },
      value: true,
    },
    "DateFormat (DateField)": {
      field: { type: FieldType.DateField },
      value: "2026-10-09",
    },
    "DateTimeFormat (DateTimeField)": {
      field: { type: FieldType.DateTimeField },
      value: "2026-10-09T12:30:00",
    },
    "TimeFormat (TimeField)": {
      field: { type: FieldType.TimeField },
      value: "12:30:00",
    },
    "FileSizeFormat (IntegerField)": {
      field: {
        type: FieldType.IntegerField,
        format_class: FieldFormat.FileSizeFormat,
      },
      value: 91341,
    },
    "FileFormat (CharField)": {
      field: {
        type: FieldType.CharField,
        format_class: FieldFormat.FileFormat,
      },
      value: "media/report.pdf",
    },
    "JSONFormat (CharField)": {
      field: { type: FieldType.CharField },
      value: { level: 1, tags: ["a", "b"] },
    },
  };

// Drives the related field column in the table example: the same
// format renderer list views use, with a customized relation display.
// Fixture rows for the relation display section: avatar, initials and
// icon, including a row where all three are set (the avatar wins).
const DISPLAY_FIXTURES: Resource[] = [
  {
    id: "1",
    __str__: "Ada Lovelace",
    description: "Avatar wins over initials and icon",
    avatar: `${window.DCS_STATIC_PREFIX ?? ""}img/media_placeholder.svg`,
    initials: "AL",
    icon: "ph-bold ph-tag",
  },
  {
    id: "2",
    __str__: "Grace Hopper",
    description: "Initials win over icon",
    initials: "GH",
    icon: "ph-bold ph-tag",
  },
  {
    id: "3",
    __str__: "News",
    description: "The icon",
    icon: "ph-bold ph-tag",
  },
];

const RELATED_FIELD: ModelField = {
  type: FieldType.CharField,
  related_model: "demo_blog.category",
  format_class: FieldFormat.ForeignKeyFormat,
};

const RELATION_FIXTURES: Record<
  string,
  { name: string; field: ModelField; value: unknown }
> = {
  // Real demo fields, so the widgets resolve actual options from the
  // relations endpoint when opened.
  "Foreign key field (ForeignKeyWidget) — live demo relation": {
    name: "author",
    field: {
      type: FieldType.CharField,
      related_model: "demo_blog.article",
      widget_class: FieldWidget.ForeignKeyWidget,
    },
    value: null,
  },
  "Many-to-many field (ManyToManyWidget) — live demo relation": {
    name: "categories",
    field: {
      type: FieldType.CharField,
      related_model: "demo_blog.article",
      widget_class: FieldWidget.ManyToManyWidget,
    },
    value: [],
  },
};

/**
 * A related-value cell driven by real data: the demo article's category,
 * serialized through the content endpoint — so its display comes from the
 * demo's custom get_relation_display (icon included).
 */
function RelatedCell() {
  const http = useHttp();
  const { data: article } = useQuery({
    retry: false,
    queryKey: ["showcase", "related-cell"],
    async queryFn() {
      const { data } = await http.get<Resource>("/content/demo_blog.article/1");
      return data;
    },
  });
  const categories = (article?.categories as Resource[] | undefined) ?? [];
  const category = categories[0] ?? null;

  return <FormatRenderer value={category} field={RELATED_FIELD} />;
}

function ShowcaseSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b pb-8 mb-8 last:border-b-0">
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>
      {children}
    </section>
  );
}

function ShowcaseWidget({
  title,
  name = "showcase",
  field,
  initialValue,
}: {
  title: string;
  /** The field name widgets address the fixture by; relation widgets use a
   * real demo field so their options resolve. */
  name?: string;
  field: ModelField;
  initialValue: unknown;
}) {
  const [value, setValue] = useState<unknown>(initialValue);

  // Widgets are driven through the same renderer the editor uses; relation
  // widgets resolve against the demo project's real article model.
  const model: Model = {
    label: field.related_model ?? "showcase",
    verbose_name: "showcase",
    verbose_name_plural: "showcase",
    tenant_field: null,
    admin: {
      is_singleton: false,
      format_mapping: {},
      widget_mapping: {},
      icon: null,
      list: {
        per_page: 20,
        description: "",
        display: [],
        search: false,
        filter: [],
        sortable_by: null,
      },
      edit: { main: [], sidebar: [], inlines: [] },
      permissions: {
        add_permission: true,
        change_permission: true,
        delete_permission: true,
        view_permission: true,
      },
    },
    fields: { [name]: field },
  };

  return (
    <div className="border rounded-lg p-4 bg-card">
      <h3 className="text-sm font-medium mb-3">{title}</h3>
      <WidgetRenderer
        model={model}
        name={name}
        value={value}
        onChange={setValue}
      />
    </div>
  );
}

export function UIPage() {
  const [checked, setChecked] = useState(false);
  const [page, setPage] = useState(3);
  // Relation widgets watch the surrounding form; the showcase provides a
  // plain one so they render outside the editor too.
  const form = useForm();

  return (
    <Form {...form}>
      <div className="flex flex-col overflow-y-auto scrollbar">
        <div className="px-8 py-2 border-b">
          <h1 className="text-lg font-semibold">UI showcase</h1>
          <div className="text-muted-foreground">
            Every component of the studio, with fixtures — a development tool,
            available in dev builds and on Django debug deployments only.
          </div>
        </div>

        <div className="px-8 py-6 max-w-5xl">
          <ShowcaseSection
            title="Buttons"
            description="All variants and sizes, including the button group."
          >
            <div className="flex flex-wrap gap-2 items-center">
              <Button>Default</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button size="icon">A</Button>
              <ButtonGroup>
                <Button>Grouped</Button>
                <Button variant="outline">Options</Button>
              </ButtonGroup>
              <Button isLoading>Loading</Button>
            </div>
          </ShowcaseSection>

          <ShowcaseSection
            title="Inputs"
            description="Text inputs, textarea, checkbox, switch and select."
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="showcase-input">Input</Label>
                <Input id="showcase-input" placeholder="Enter a value" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="showcase-textarea">Textarea</Label>
                <Textarea id="showcase-textarea" placeholder="Enter a text" />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) => setChecked(!!value)}
                />
                <Label>Checkbox</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch />
                <Label>Switch</Label>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Select</Label>
                <Select>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Pick one" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </ShowcaseSection>

          <ShowcaseSection
            title="Feedback"
            description="Alerts, badges and the spinner."
          >
            <div className="space-y-3">
              <Alert>
                <AlertDescription>
                  A default alert with some contextual information.
                </AlertDescription>
              </Alert>
              <Alert variant="destructive">
                <AlertDescription>
                  A destructive alert for errors and destructive confirmations.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2 items-center">
                <Badge>Default</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
                <Spinner />
              </div>
            </div>
          </ShowcaseSection>

          <ShowcaseSection
            title="Overlays"
            description="Dropdown menus and tooltips."
          >
            <div className="flex gap-4 items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">Dropdown</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem>First action</DropdownMenuItem>
                  <DropdownMenuItem>Second action</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">
                    Destructive action
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline">Hover me</Button>
                </TooltipTrigger>
                <TooltipContent>A tooltip</TooltipContent>
              </Tooltip>
            </div>
          </ShowcaseSection>

          <ShowcaseSection
            title="Structure"
            description="Tabs, tables, separators and pagination."
          >
            <Tabs defaultValue="first" className="mb-4">
              <TabsList>
                <TabsTrigger value="first">First</TabsTrigger>
                <TabsTrigger value="second">Second</TabsTrigger>
              </TabsList>
              <TabsContent value="first">Content of the first tab.</TabsContent>
              <TabsContent value="second">
                Content of the second tab.
              </TabsContent>
            </Tabs>
            <Table className="mb-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Hello, Content Studio</TableCell>
                  <TableCell>Published</TableCell>
                  <TableCell>
                    <RelatedCell />
                  </TableCell>
                  <TableCell className="text-right">128</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>A second article</TableCell>
                  <TableCell>Draft</TableCell>
                  <TableCell>
                    <FormatRenderer value={null} field={RELATED_FIELD} />
                  </TableCell>
                  <TableCell className="text-right">0</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <Separator className="mb-4" />
            <div className="flex justify-center">
              <Pagination current={page} pages={7} onPageChange={setPage} />
            </div>
          </ShowcaseSection>

          <ShowcaseSection
            title="Field widgets"
            description="Every widget in the registry, driven through the same WidgetRenderer the editor uses — fully interactive."
          >
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(WIDGET_FIXTURES).map(([title, fixture]) => (
                <ShowcaseWidget
                  key={title}
                  title={title}
                  field={fixture.field}
                  initialValue={fixture.value}
                />
              ))}
            </div>
          </ShowcaseSection>

          <ShowcaseSection
            title="Relation display"
            description="The relation display glyph: avatar, initials and icon variants, shown one at a time with the priority avatar → initials → icon."
          >
            <div className="border rounded-lg divide-y">
              {DISPLAY_FIXTURES.map((option) => (
                <div key={option.id} className="px-4 py-2">
                  <RelationOption option={option} />
                </div>
              ))}
            </div>
          </ShowcaseSection>

          <ShowcaseSection
            title="Relation widgets"
            description="These resolve options against the demo project's live relations endpoint; open them to browse."
          >
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(RELATION_FIXTURES).map(([title, fixture]) => (
                <ShowcaseWidget
                  key={title}
                  title={title}
                  name={fixture.name}
                  field={fixture.field}
                  initialValue={fixture.value}
                />
              ))}
            </div>
          </ShowcaseSection>

          <ShowcaseSection
            title="Format renderers"
            description="How field values are displayed in list views."
          >
            <div className="border rounded-lg divide-y">
              {Object.entries(FORMAT_FIXTURES).map(([title, fixture]) => (
                <div
                  key={title}
                  className="flex items-center justify-between gap-8 px-4 py-2"
                >
                  <span className="text-sm text-muted-foreground">{title}</span>
                  <span className="text-sm">
                    <FormatRenderer
                      value={fixture.value}
                      field={fixture.field}
                    />
                  </span>
                </div>
              ))}
            </div>
          </ShowcaseSection>
        </div>
      </div>
    </Form>
  );
}
