import type * as React from "react";

// Types as documentation for the ContentStudio bundle: the admin's own
// components (frontend/src/components/ui), built on Radix primitives.

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  /** Shows a spinner and disables the button. */
  isLoading?: boolean;
  /** Renders the child element (a link) with the button's styling. */
  asChild?: boolean;
}
export declare function Button(props: ButtonProps): React.ReactElement;
/** Button classes for a native element, such as a Radix trigger: `className={buttonVariants({ variant: "outline" })}`. */
export declare function buttonVariants(options?: Pick<ButtonProps, "variant" | "size">): string;

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "default" | "lg";
}
export declare function Input(props: InputProps): React.ReactElement;

export declare function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>): React.ReactElement;

export interface SelectProps {
  value?: string; defaultValue?: string; onValueChange?: (value: string) => void;
  open?: boolean; disabled?: boolean; children?: React.ReactNode;
}
export declare function Select(props: SelectProps): React.ReactElement;
export declare function SelectTrigger(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: "sm" | "default" | "lg" }): React.ReactElement;
export declare function SelectValue(props: { placeholder?: React.ReactNode }): React.ReactElement;
export declare function SelectContent(props: { children?: React.ReactNode; position?: "item-aligned" | "popper" }): React.ReactElement;
export declare function SelectGroup(props: { children?: React.ReactNode }): React.ReactElement;
export declare function SelectLabel(props: { children?: React.ReactNode }): React.ReactElement;
export declare function SelectItem(props: { value: string; disabled?: boolean; children?: React.ReactNode }): React.ReactElement;

export interface CheckboxProps {
  checked?: boolean | "indeterminate"; defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean | "indeterminate") => void;
  disabled?: boolean; id?: string;
}
export declare function Checkbox(props: CheckboxProps): React.ReactElement;

export declare function DragHandle(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { disabled?: boolean }): React.ReactElement;

export interface SwitchProps {
  checked?: boolean; defaultChecked?: boolean; onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean; id?: string;
}
export declare function Switch(props: SwitchProps): React.ReactElement;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "destructive" | "outline";
  asChild?: boolean;
}
export declare function Badge(props: BadgeProps): React.ReactElement;

export declare function Tabs(props: { value?: string; defaultValue?: string; onValueChange?: (value: string) => void; children?: React.ReactNode }): React.ReactElement;
export declare function TabsList(props: { children?: React.ReactNode }): React.ReactElement;
export declare function TabsTrigger(props: { value: string; disabled?: boolean; children?: React.ReactNode }): React.ReactElement;
export declare function TabsContent(props: { value: string; children?: React.ReactNode }): React.ReactElement;

export declare function Table(props: React.TableHTMLAttributes<HTMLTableElement>): React.ReactElement;
export declare function TableHeader(props: React.HTMLAttributes<HTMLTableSectionElement>): React.ReactElement;
export declare function TableBody(props: React.HTMLAttributes<HTMLTableSectionElement>): React.ReactElement;
export declare function TableRow(props: React.HTMLAttributes<HTMLTableRowElement>): React.ReactElement;
export declare function TableHead(props: React.ThHTMLAttributes<HTMLTableCellElement>): React.ReactElement;
export declare function TableCell(props: React.TdHTMLAttributes<HTMLTableCellElement>): React.ReactElement;
export declare function TableCaption(props: React.HTMLAttributes<HTMLTableCaptionElement>): React.ReactElement;

export declare function Dialog(props: { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; children?: React.ReactNode }): React.ReactElement;
export declare function DialogTrigger(props: { asChild?: boolean; children?: React.ReactNode }): React.ReactElement;
export declare function DialogContent(props: { showCloseButton?: boolean; children?: React.ReactNode }): React.ReactElement;
export declare function DialogHeader(props: { children?: React.ReactNode }): React.ReactElement;
export declare function DialogFooter(props: { children?: React.ReactNode }): React.ReactElement;
export declare function DialogTitle(props: { children?: React.ReactNode }): React.ReactElement;
export declare function DialogDescription(props: { children?: React.ReactNode }): React.ReactElement;
export declare function DialogClose(props: { asChild?: boolean; children?: React.ReactNode }): React.ReactElement;

export declare function TooltipProvider(props: { delayDuration?: number; children?: React.ReactNode }): React.ReactElement;
export declare function Tooltip(props: { open?: boolean; defaultOpen?: boolean; children?: React.ReactNode }): React.ReactElement;
export declare function TooltipTrigger(props: { asChild?: boolean; children?: React.ReactNode }): React.ReactElement;
export declare function TooltipContent(props: { side?: "top" | "right" | "bottom" | "left"; children?: React.ReactNode }): React.ReactElement;

export declare function Alert(props: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "destructive" }): React.ReactElement;
export declare function AlertTitle(props: React.HTMLAttributes<HTMLDivElement>): React.ReactElement;
export declare function AlertDescription(props: React.HTMLAttributes<HTMLDivElement>): React.ReactElement;

type Children = { children?: React.ReactNode };
type Div = React.HTMLAttributes<HTMLDivElement>;
type OpenState = { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void };

export declare function ButtonGroup(props: Div & { orientation?: "horizontal" | "vertical" }): React.ReactElement;
export declare function ButtonGroupText(props: Div & { asChild?: boolean }): React.ReactElement;
export declare function ButtonGroupSeparator(props: { orientation?: "horizontal" | "vertical" }): React.ReactElement;

export interface ToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean; defaultPressed?: boolean; onPressedChange?: (pressed: boolean) => void;
  variant?: "default" | "outline"; size?: "default" | "sm" | "lg";
}
export declare function Toggle(props: ToggleProps): React.ReactElement;
export declare function ToggleGroup(props: Children & {
  type: "single" | "multiple"; value?: string | string[]; defaultValue?: string | string[];
  onValueChange?: (value: any) => void; variant?: "default" | "outline"; size?: "default" | "sm" | "lg"; disabled?: boolean;
}): React.ReactElement;
export declare function ToggleGroupItem(props: Children & { value: string; disabled?: boolean; "aria-label"?: string }): React.ReactElement;

export declare function InputGroup(props: Div): React.ReactElement;
export declare function InputGroupAddon(props: Div & { align?: "inline-start" | "inline-end" | "block-start" | "block-end" }): React.ReactElement;
export declare function InputGroupText(props: React.HTMLAttributes<HTMLSpanElement>): React.ReactElement;
export declare function InputGroupButton(props: Omit<ButtonProps, "size"> & { size?: "xs" | "sm" | "icon-xs" | "icon-sm" }): React.ReactElement;
export declare function InputGroupInput(props: React.InputHTMLAttributes<HTMLInputElement>): React.ReactElement;
export declare function InputGroupTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>): React.ReactElement;

/** An Input that calls onChange with the text 500 ms after typing stops. */
export declare function DebouncedInput(props: Omit<InputProps, "onChange"> & { onChange?: (value: string) => void }): React.ReactElement;

export declare function Label(props: React.LabelHTMLAttributes<HTMLLabelElement>): React.ReactElement;

export interface MultiSelectOption { value: string; label: string; disable?: boolean; fixed?: boolean }
export interface MultiSelectProps {
  value?: MultiSelectOption[]; onChange?: (options: MultiSelectOption[]) => void;
  options?: MultiSelectOption[]; defaultOptions?: MultiSelectOption[];
  onSearch?: (value: string) => Promise<MultiSelectOption[]>; delay?: number; groupBy?: string;
  placeholder?: string; emptyIndicator?: React.ReactNode; loadingIndicator?: React.ReactNode;
  maxSelected?: number; onMaxSelected?: (max: number) => void; hidePlaceholderWhenSelected?: boolean;
  creatable?: boolean; disabled?: boolean; className?: string;
}
export declare function MultiSelect(props: MultiSelectProps): React.ReactElement;

export interface TagInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string[]; onChange: (tags: string[]) => void; maxTags?: number;
}
export declare function TagInput(props: TagInputProps): React.ReactElement;

export declare function InputOTP(props: Children & { maxLength: number; value?: string; onChange?: (value: string) => void; disabled?: boolean }): React.ReactElement;
export declare function InputOTPGroup(props: Div): React.ReactElement;
export declare function InputOTPSlot(props: { index: number; className?: string }): React.ReactElement;
export declare function InputOTPSeparator(props: Div): React.ReactElement;

/** react-day-picker's DayPicker props, styled for the admin. */
export declare function Calendar(props: {
  mode?: "single" | "multiple" | "range"; selected?: any; onSelect?: (value: any) => void;
  defaultMonth?: Date; captionLayout?: "label" | "dropdown"; disabled?: any; className?: string;
}): React.ReactElement;

/** react-hook-form's useForm; pass its result to Form. */
export declare function useForm(options?: { defaultValues?: Record<string, unknown> }): any;
export declare function Form(props: Children & Record<string, unknown>): React.ReactElement;
export declare function FormField(props: { control: any; name: string; render: (props: { field: any; fieldState: any }) => React.ReactElement }): React.ReactElement;
export declare function FormItem(props: Div): React.ReactElement;
export declare function FormLabel(props: React.LabelHTMLAttributes<HTMLLabelElement>): React.ReactElement;
export declare function FormControl(props: Children): React.ReactElement;
export declare function FormDescription(props: React.HTMLAttributes<HTMLParagraphElement>): React.ReactElement;
export declare function FormMessage(props: React.HTMLAttributes<HTMLParagraphElement>): React.ReactElement;

export declare function Avatar(props: React.HTMLAttributes<HTMLSpanElement>): React.ReactElement;
export declare function AvatarImage(props: React.ImgHTMLAttributes<HTMLImageElement>): React.ReactElement;
export declare function AvatarFallback(props: React.HTMLAttributes<HTMLSpanElement>): React.ReactElement;

export declare function Separator(props: { orientation?: "horizontal" | "vertical"; decorative?: boolean; className?: string }): React.ReactElement;

export declare function Spinner(props: { className?: string }): React.ReactElement;

/** Pages count from 1; renders nothing for a single page. */
export declare function Pagination(props: { current: number; pages: number; onPageChange: (page: number) => void }): React.ReactElement;

export declare function Command(props: Div & { shouldFilter?: boolean }): React.ReactElement;
export declare function CommandDialog(props: Children & OpenState & { title?: string; description?: string }): React.ReactElement;
export declare function CommandInput(props: React.InputHTMLAttributes<HTMLInputElement>): React.ReactElement;
export declare function CommandList(props: Div): React.ReactElement;
export declare function CommandEmpty(props: Div): React.ReactElement;
export declare function CommandGroup(props: Div & { heading?: React.ReactNode }): React.ReactElement;
export declare function CommandItem(props: Div & { value?: string; onSelect?: (value: string) => void; disabled?: boolean }): React.ReactElement;
export declare function CommandSeparator(props: Div): React.ReactElement;
export declare function CommandShortcut(props: React.HTMLAttributes<HTMLSpanElement>): React.ReactElement;

export declare function AlertDialog(props: Children & OpenState): React.ReactElement;
export declare function AlertDialogTrigger(props: Children & { asChild?: boolean }): React.ReactElement;
export declare function AlertDialogContent(props: Div): React.ReactElement;
export declare function AlertDialogHeader(props: Div): React.ReactElement;
export declare function AlertDialogFooter(props: Div): React.ReactElement;
export declare function AlertDialogTitle(props: Div): React.ReactElement;
export declare function AlertDialogDescription(props: Div): React.ReactElement;
export declare function AlertDialogAction(props: React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement;
export declare function AlertDialogCancel(props: React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement;

export declare function Sheet(props: Children & OpenState): React.ReactElement;
export declare function SheetTrigger(props: Children & { asChild?: boolean }): React.ReactElement;
export declare function SheetContent(props: Div & { side?: "top" | "right" | "bottom" | "left" }): React.ReactElement;
export declare function SheetHeader(props: Div): React.ReactElement;
export declare function SheetFooter(props: Div): React.ReactElement;
export declare function SheetTitle(props: Div): React.ReactElement;
export declare function SheetDescription(props: Div): React.ReactElement;
export declare function SheetClose(props: Children & { asChild?: boolean }): React.ReactElement;

export declare function Popover(props: Children & OpenState): React.ReactElement;
export declare function PopoverTrigger(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }): React.ReactElement;
export declare function PopoverAnchor(props: Children): React.ReactElement;
export declare function PopoverContent(props: Div & { align?: "start" | "center" | "end"; side?: "top" | "right" | "bottom" | "left" }): React.ReactElement;

type MenuItem = Div & { onSelect?: (event: Event) => void; disabled?: boolean; inset?: boolean; variant?: "default" | "destructive" };
export declare function DropdownMenu(props: Children & OpenState & { modal?: boolean }): React.ReactElement;
export declare function DropdownMenuTrigger(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }): React.ReactElement;
export declare function DropdownMenuContent(props: Div & { align?: "start" | "center" | "end" }): React.ReactElement;
export declare function DropdownMenuGroup(props: Div): React.ReactElement;
export declare function DropdownMenuLabel(props: Div & { inset?: boolean }): React.ReactElement;
export declare function DropdownMenuItem(props: MenuItem): React.ReactElement;
export declare function DropdownMenuCheckboxItem(props: Div & { checked?: boolean; onCheckedChange?: (checked: boolean) => void }): React.ReactElement;
export declare function DropdownMenuSeparator(props: Div): React.ReactElement;
export declare function DropdownMenuShortcut(props: React.HTMLAttributes<HTMLSpanElement>): React.ReactElement;

export declare function ContextMenu(props: Children & { modal?: boolean; onOpenChange?: (open: boolean) => void }): React.ReactElement;
export declare function ContextMenuTrigger(props: Children & { asChild?: boolean }): React.ReactElement;
export declare function ContextMenuContent(props: Div): React.ReactElement;
export declare function ContextMenuLabel(props: Div & { inset?: boolean }): React.ReactElement;
export declare function ContextMenuItem(props: MenuItem): React.ReactElement;
export declare function ContextMenuSeparator(props: Div): React.ReactElement;
export declare function ContextMenuShortcut(props: React.HTMLAttributes<HTMLSpanElement>): React.ReactElement;

/** One per app; show messages with toast(). */
export declare function Toaster(props: { position?: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right"; expand?: boolean; duration?: number }): React.ReactElement;
export declare const toast: ((message: React.ReactNode) => string | number) & {
  success(message: React.ReactNode): string | number;
  error(message: React.ReactNode): string | number;
};

/** The 56px bar at the top of every page: title left, actions right; rows under it (a Toolbar, scope tabs) as children. */
export declare function PageHeader(props: {
  back?: React.ReactNode; icon?: React.ReactNode; title: React.ReactNode; meta?: React.ReactNode;
  description?: React.ReactNode; actions?: React.ReactNode; heading?: "h1" | "div"; children?: React.ReactNode;
}): React.ReactElement;
/** A row under the page header for search, filters and view toggles. */
export declare function Toolbar(props: Div): React.ReactElement;
/** The scrolling page body, capped at the content width. */
export declare function PageBody(props: Div): React.ReactElement;

/** An icon, a title, a line of explanation and one action, for an empty list or grid. */
export declare function EmptyState(props: {
  icon?: React.ReactNode; title?: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string;
}): React.ReactElement;

/** The pill floating at the foot of the page while rows are selected: the count, the actions (children) and a clear button. */
export declare function BulkBar(props: {
  label: React.ReactNode; clearLabel: string; onClear: () => void; children?: React.ReactNode; className?: string;
}): React.ReactElement;

declare global { interface Window { ContentStudio: Record<string, React.ComponentType<any>> } }
