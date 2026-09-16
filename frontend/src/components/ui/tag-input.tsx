"use client";

import * as React from "react";
import { PiXBold } from "react-icons/pi";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface TagInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> {
  /** Current list of tags (controlled). */
  value: string[];
  /** Called with the full next list of tags whenever it changes. */
  onChange: (tags: string[]) => void;
  /** Optional cap on number of tags. */
  maxTags?: number;
  /** Wrapper class name (the bordered "input-like" container). */
  className?: string;
}

/**
 * A shadcn/ui-style tag input.
 *
 * - Renders each tag as a <Badge> with an "x" remove button.
 * - New tags are committed on Enter, "," (comma), or on blur.
 * - Duplicate tags (case-insensitive) are ignored.
 * - Backspace on an empty input removes the last tag.
 *
 * Usage:
 *   const [tags, setTags] = React.useState<string[]>([])
 *   <TagInput value={tags} onChange={setTags} placeholder="Add a tag..." />
 */
export const TagInput = React.forwardRef<HTMLInputElement, TagInputProps>(
  (
    {
      value,
      onChange,
      maxTags,
      className,
      placeholder = "Add a tag...",
      disabled,
      ...inputProps
    },
    ref,
  ) => {
    const [inputValue, setInputValue] = React.useState("");
    const innerRef = React.useRef<HTMLInputElement>(null);
    const inputRef = (ref as React.RefObject<HTMLInputElement>) ?? innerRef;

    const atMax = typeof maxTags === "number" && value.length >= maxTags;

    const commitTag = (raw: string) => {
      const tag = raw.trim();
      if (!tag) return;
      if (atMax) return;

      const exists = value.some((t) => t.toLowerCase() === tag.toLowerCase());
      if (exists) {
        setInputValue("");
        return;
      }

      onChange([...value, tag]);
      setInputValue("");
    };

    const removeTag = (index: number) => {
      if (disabled) return;
      const next = value.slice();
      next.splice(index, 1);
      onChange(next);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        commitTag(inputValue);
        return;
      }

      if (e.key === "Backspace" && inputValue === "" && value.length > 0) {
        // Remove the last tag when backspacing on an empty field.
        removeTag(value.length - 1);
      }
    };

    const handleBlur = () => {
      if (inputValue.trim()) {
        commitTag(inputValue);
      }
    };

    return (
      <div
        className={cn(
          "flex min-h-8 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-1 text-sm",
          "focus-within:border-gray-400 focus-within:outline-none",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, index) => (
          <Badge
            key={`${tag}-${index}`}
            variant="secondary"
            className="flex items-center gap-1 pr-1 font-normal"
          >
            <span>{tag}</span>
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                removeTag(index);
              }}
              className={cn(
                "rounded-full p-0.5 outline-none",
                "hover:bg-muted-foreground/20 focus-visible:ring-1 focus-visible:ring-ring",
                disabled && "pointer-events-none",
              )}
            >
              <PiXBold className="size-3" />
            </button>
          </Badge>
        ))}

        <input
          {...inputProps}
          ref={inputRef}
          type="text"
          disabled={disabled || atMax}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={value.length === 0 ? placeholder : atMax ? "" : ""}
          className={cn(
            "flex-1 min-w-[80px] text-sm bg-transparent outline-none placeholder:text-muted-foreground",
            "disabled:cursor-not-allowed",
          )}
        />
      </div>
    );
  },
);

TagInput.displayName = "TagInput";
