// Entry of the design system bundle: the admin's own components, exposed as
// window.ContentStudio. Built by design-system/build.mjs.
/* eslint-disable react-refresh/only-export-components -- a bundle entry, not a module of the app */
import "@/index.css";

export { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
export { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
export { Badge } from "@/components/ui/badge";
export { Button, buttonVariants } from "@/components/ui/button";
export {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "@/components/ui/button-group";
export { Calendar } from "@/components/ui/calendar";
export { Checkbox } from "@/components/ui/checkbox";
export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
export { DebouncedInput } from "@/components/ui/debounced-input";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
export { DragHandle } from "@/components/ui/drag-handle";
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
export { Input } from "@/components/ui/input";
export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
export {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
export { Label } from "@/components/ui/label";
export { MultiSelect } from "@/components/ui/multi-select";
export { Pagination } from "@/components/ui/pagination";
export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export { Separator } from "@/components/ui/separator";
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
export { Toaster } from "@/components/ui/sonner";
export { Spinner } from "@/components/ui/spinner";
export { Switch } from "@/components/ui/switch";
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
export { TagInput } from "@/components/ui/tag-input";
export { Textarea } from "@/components/ui/textarea";
export { Toggle } from "@/components/ui/toggle";
export { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
export { useForm } from "react-hook-form";
export { toast } from "sonner";
