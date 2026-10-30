import { Input } from "@/components/ui/input";
import type { InputWidgetOptions, WidgetProps } from "@/types";

export function InputWidget({
  value,
  onChange,
  options = {},
}: WidgetProps<string, InputWidgetOptions>) {
  const { placeholder, prefix, suffix, min_value, max_value, step } = options;
  // Number limits make it a number input, with the limits on its stepper.
  const isNumber =
    min_value !== undefined || max_value !== undefined || step !== undefined;
  const isAdorned = Boolean(prefix || suffix);

  const input = (
    <Input
      value={value}
      type={isNumber ? "number" : undefined}
      min={min_value}
      max={max_value}
      step={step}
      placeholder={placeholder}
      className={
        isAdorned
          ? "h-auto flex-1 border-0 bg-transparent px-0 focus:border-0"
          : undefined
      }
      onChange={(e) => onChange(e.target.value)}
    />
  );

  if (!isAdorned) {
    return <div>{input}</div>;
  }

  // The prefix and suffix sit inside the box, around the value.
  return (
    <div className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm focus-within:border-ring">
      {prefix && (
        <span className="text-muted-foreground select-none">{prefix}</span>
      )}
      {input}
      {suffix && (
        <span className="text-muted-foreground select-none">{suffix}</span>
      )}
    </div>
  );
}
