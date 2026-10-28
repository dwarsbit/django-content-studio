import colors from "tailwindcss/colors";

export type Id = string;
export type DateString = string;
export type DateTimeString = string;

export type TailwindColor = Exclude<
  keyof typeof colors,
  "inherit" | "transparent" | "current" | "black" | "white"
>;

export interface PaginatedResponse<T> {
  pagination: {
    count: number;
    current: number;
    pages: number;
  };
  results: T[];
}

export interface AuthState {
  token: string | null;
  setToken(token: string | null): void;
  isAuthenticated: boolean;
  logout(): Promise<void>;
}

export interface AdminInfo {
  site_header: string;
  site_title: string;
  index_title: string;
  site_url: string;
  health_check: null;
  login_backends: LoginBackend[];
  token_backend: TokenBackend;
  formats: Record<FieldType, { name: FieldFormat }>;
  widgets: Record<FieldType, { name: FieldWidget }>;
  settings: {
    created_at_attr: string;
    created_by_attr: string;
    edited_at_attr: string;
    edited_by_attr: string;
  };
}

export type LoginBackend = UsernamePasswordBackend;

export enum LoginBackendType {
  UsernamePassword = "UsernamePasswordBackend",
}

export interface UsernamePasswordBackend {
  type: LoginBackendType.UsernamePassword;
  config: {
    username_field_type: FieldType.EmailField | FieldType.CharField;
  };
}

export type TokenBackend = JsonWebTokenBackend;

export enum TokenBackendType {
  JsonWebToken = "JsonWebTokenBackend",
}

export interface JsonWebTokenBackend {
  type: TokenBackendType.JsonWebToken;
  config: {
    ACCESS_TOKEN_LIFETIME: number;
    REFRESH_TOKEN_LIFETIME: number;
  };
}

export interface SessionUser {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
}

export interface ModelGroup {
  models: string[];
  name: string;
  icon: string | null;
  // Accepted for compatibility; the main menu no longer shows it.
  color: TailwindColor | null;
  label: string;
  // Starts collapsed in the main menu; the group holding the current
  // model is always expanded.
  collapsed?: boolean;
}

export interface Model {
  label: string;
  verbose_name: string;
  verbose_name_plural: string;
  tenant_field: string | null;
  admin: {
    is_singleton: boolean;
    icon: string | null;
    list: {
      per_page: number;
      description: string;
      display: {
        name: string;
        header: string | null;
        format: string | null;
      }[];
      views?: string[];
      search: boolean;
      filter: string[];
      trash?: boolean;
      sortable_by: string[] | null;
      // Whether the user may reorder the list (reorder_field is set).
      reorderable?: boolean;
      actions: BulkAction[];
    };
    edit: {
      // Components in the edit page's header, next to the save button.
      header?: FormField[];
      main: FormSetGroup[];
      sidebar: FormSet[];
      // The create form's read-only fields (get_readonly_fields without
      // an object); saved objects carry their own __readonly_fields__.
      readonly_fields?: string[];
      // The create form's prepopulated fields, mapped to their sources.
      prepopulated_fields?: Record<string, string[]>;
      // Whether the edit page offers Duplicate (allow_duplication);
      // it also needs add permission.
      duplicate?: boolean;
      inlines: {
        model: string;
        fk_name: string;
        readonly_fields?: string[];
        prepopulated_fields?: Record<string, string[]>;
        table_display: {
          name: string;
          header: string | null;
          format: string | null;
        }[];
        reorderable?: boolean;
        // Components in the header of an inline row's editor.
        header?: FormField[];
        // The inline studio's permissions; unset grants everything the
        // inline endpoints allow.
        permissions?: Permissions;
      }[];
    };
    permissions: Permissions;
  };
  fields: Record<string, ModelField>;
}

// A duplicate's starting point: the copied values, in the form's
// shape, and the object they were copied from.
export interface DuplicateInitial {
  initial: Partial<Resource>;
  source: { id: Id; __str__: string };
}

export interface Permissions {
  add_permission: boolean;
  change_permission: boolean;
  delete_permission: boolean;
  view_permission: boolean;
}

export interface BulkAction {
  id: string;
  label: string;
  icon: string | null;
  confirm: string | null;
  destructive: boolean;
}

export interface ModelField {
  type: FieldType;
  choices?: [string, string][];
  required?: boolean;
  verbose_name?: string;
  readonly?: boolean;
  default?: unknown;
  primary_key?: boolean;
  // unique=True (not the primary key): the editor warns about duplicates.
  unique?: boolean;
  max_length?: number;
  help_text?: string;
  widget_class?: FieldWidget;
  format_class?: FieldFormat;
  related_model?: string;
  json_schema?: Record<string, unknown>;
  multiple?: boolean;
  // BlockField: the block types and the limits on the number of blocks.
  blocks?: BlockDefinition[];
  min_num?: number | null;
  max_num?: number | null;
}

export interface BlockDefinition {
  name: string;
  verbose_name: string;
  description: string;
  icon: string | null;
  fields: Record<string, ModelField>;
}

export interface BlockValue {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

/**
 * Props shared by field widgets. The concrete value type depends on the
 * field being edited, so every widget instantiates this with the type it
 * handles; the widget registry passes values through as `unknown`.
 */
export interface WidgetProps<T> {
  value?: T;
  onChange(value: T): void;
}

export interface Resource {
  id: Id;
  __str__: string;
  // The resolved list item display, present on list rows when the admin
  // offers the list view.
  list_item_display?: {
    title: string;
    description?: string;
    meta?: string;
  };
  // Relation display customization (ModelAdmin.get_relation_display).
  description?: string | null;
  icon?: string | null;
  initials?: string | null;
  avatar?: string | null;
  // The fields read-only for this object (get_readonly_fields), on
  // detail responses.
  __readonly_fields__?: string[];
  [key: string]: unknown;
}

export interface FormSetGroup {
  label: string;
  formsets: FormSet[];
}

export interface FormLayout {
  columns: number;
  fields: FormField[];
}

export interface FormSet {
  title: string;
  description: string;
  fields: (FormField | FormLayout)[];
}

export interface FormField {
  type: "field" | "component";
  name: string;
  label: string | null;
  readonly: boolean;
  col_span: number;
  // Widget override from the form configuration; falls back to the
  // model field's default widget when null.
  widget: FieldWidget | null;
  component_id: string;
  component_type: "Link" | "LinkButton" | "Button" | "ActivityLog";
  copy: boolean;
  icon: string;
  title?: string | null;
  // Button: a question to confirm first, and the destructive style.
  confirm?: string | null;
  destructive?: boolean;
}

// What a server-side button reports back: a message, and optionally a
// value shown once (such as a generated secret).
export interface ButtonResult {
  message: string | null;
  value: string | null;
}

export enum FieldType {
  BlockField = "BlockField",
  BooleanField = "BooleanField",
  CharField = "CharField",
  DateField = "DateField",
  DateTimeField = "DateTimeField",
  DecimalField = "DecimalField",
  EmailField = "EmailField",
  FlexField = "FlexField",
  FloatField = "FloatField",
  HTMLField = "HTMLField",
  IntegerField = "IntegerField",
  SlugField = "SlugField",
  TextField = "TextField",
  TimeField = "TimeField",
  URLPathField = "URLPathField",
  UUIDField = "UUIDField",
}

export enum FieldFormat {
  BlockFormat = "BlockFormat",
  BooleanFormat = "BooleanFormat",
  DateFormat = "DateFormat",
  DateTimeFormat = "DateTimeFormat",
  FileFormat = "FileFormat",
  FileSizeFormat = "FileSizeFormat",
  ForeignKeyFormat = "ForeignKeyFormat",
  HtmlFormat = "HtmlFormat",
  MediaFormat = "MediaFormat",
  NumberFormat = "NumberFormat",
  TagFormat = "TagFormat",
  TextFormat = "TextFormat",
  TimeFormat = "TimeFormat",
  JSONFormat = "JSONFormat",
}

export enum FieldWidget {
  BlockWidget = "BlockWidget",
  CheckboxWidget = "CheckboxWidget",
  DateTimeWidget = "DateTimeWidget",
  DateWidget = "DateWidget",
  ForeignKeyWidget = "ForeignKeyWidget",
  InputWidget = "InputWidget",
  JSONSchemaWidget = "JSONSchemaWidget",
  ManyToManyWidget = "ManyToManyWidget",
  MediaWidget = "MediaWidget",
  ManyMediaWidget = "ManyMediaWidget",
  MultiSelectWidget = "MultiSelectWidget",
  RadioButtonWidget = "RadioButtonWidget",
  RichTextWidget = "RichTextWidget",
  SelectWidget = "SelectWidget",
  SlugWidget = "SlugWidget",
  SwitchWidget = "SwitchWidget",
  TextAreaWidget = "TextAreaWidget",
  ToggleGroupWidget = "ToggleGroupWidget",
  TimeWidget = "TimeWidget",
  URLPathWidget = "URLPathWidget",
  TagWidget = "TagWidget",
}

export interface CropValue {
  x: string;
  y: string;
  width: string;
  height: string;
  unit: "%";
}

// The focal point on an image, as percentages of its dimensions.
export interface FocalPointValue {
  x: number;
  y: number;
}

export interface MediaItem {
  id: string;
  folder: string | null;
  name: string;
  thumbnail: string;
  file: string;
  tags: string[];
  alt_text: string;
  type: "file" | "image" | "video" | "audio";
  size: number;
}

export interface MediaFolder {
  id: string;
  name: string;
  parent: string | null;
  has_children: boolean;
  /** The folder's direct items; null without a media model. */
  count?: number | null;
}

export interface Dashboard {
  widgets: DashboardWidget[];
}

export interface DashboardWidget {
  name: string;
  // How the widget is shown; independent of its name.
  widget_type: DashboardWidgetType | null;
  widget_id: string;
  col_span: number;
}

export enum DashboardWidgetType {
  SpacingWidget = "SpacingWidget",
  StatisticWidget = "StatisticWidget",
  ActivityLogWidget = "ActivityLogWidget",
  ScheduledTasksWidget = "ScheduledTasksWidget",
  ContentListWidget = "ContentListWidget",
}

export interface ActivityLogEntry {
  id: number;
  action_flag: 1 | 2 | 3; // Addition, change or deletion
  action_time: DateTimeString;
  object_repr: string;
  object_id: string;
  object_model: string;
  user?: {
    id: string;
    __str__: string;
  };
}

/** One model's results from the global search endpoint. */
export interface SearchResultGroup {
  model: string;
  verbose_name: string;
  icon: string | null;
  results: { id: Id; title: string }[];
}

export interface MainMenuLinkConfig {
  url: string;
  icon: string | null;
  color: TailwindColor | null;
  label: string;
  // The position among the menu's links and buttons: lower first.
  weight?: number;
}

export interface MainMenuButtonConfig {
  label: string;
  icon: string | null;
  color: TailwindColor | null;
  confirm: string | null;
  weight?: number;
}

export interface IFramePageConfig {
  path: string;
  iframe_url: string;
}

export interface MainMenuLinkExtension {
  extension_id: string;
  extension_type: ExtensionType.MainMenuLink;
  config: MainMenuLinkConfig;
}

export interface IFramePageExtension {
  extension_id: string;
  extension_type: ExtensionType.IFramePage;
  config: IFramePageConfig;
}

export interface MainMenuButtonExtension {
  extension_id: string;
  extension_type: ExtensionType.MainMenuButton;
  config: MainMenuButtonConfig;
}

export type Extension =
  MainMenuLinkExtension | MainMenuButtonExtension | IFramePageExtension;

export enum ExtensionType {
  MainMenuLink = "MainMenuLink",
  MainMenuButton = "MainMenuButton",
  IFramePage = "IFramePage",
}
