import { useEffect, useRef, useState } from "react";

import type { CodeEditorHandle, CodeLanguage } from "@/lib/code-editor/editor";
import { cn } from "@/lib/utils";

export type { CodeLanguage };

// The editor's chunk, loaded once, on the first code field shown.
let editorModule: Promise<typeof import("@/lib/code-editor/editor")> | null =
  null;

function loadEditor() {
  editorModule ??= import("@/lib/code-editor/editor");
  return editorModule;
}

/**
 * A code editor with syntax highlighting and line numbers. CodeMirror
 * loads on demand; until it is there, the value shows as plain
 * monospace text.
 */
function CodeEditor({
  value,
  onChange,
  language,
  readOnly,
  placeholder,
  className,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange(value: string): void;
  language?: CodeLanguage | null;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<CodeEditorHandle | null>(null);
  const onChangeRef = useRef(onChange);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const attributes: Record<string, string> = {};

  if (id) attributes.id = id;
  if (ariaDescribedBy) attributes["aria-describedby"] = ariaDescribedBy;
  if (ariaInvalid) attributes["aria-invalid"] = "true";
  if (ariaLabel) attributes["aria-label"] = ariaLabel;

  const attributesKey = JSON.stringify(attributes);
  // The first render's settings; later changes go through the handle.
  const initial = useRef({ value, readOnly, placeholder, attributes });

  useEffect(() => {
    let cancelled = false;

    loadEditor()
      .then(({ createCodeEditor }) => {
        if (cancelled || !parentRef.current) {
          return;
        }

        handleRef.current = createCodeEditor(parentRef.current, {
          ...initial.current,
          language,
          onChange: (next) => onChangeRef.current(next),
        });
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [language]);

  useEffect(() => {
    handleRef.current?.setValue(value);
  }, [value, loaded]);

  useEffect(() => {
    handleRef.current?.setReadOnly(!!readOnly);
  }, [readOnly, loaded]);

  useEffect(() => {
    handleRef.current?.setAttributes(JSON.parse(attributesKey));
  }, [attributesKey, loaded]);

  return (
    <div
      data-slot="code-editor"
      className={cn(
        "border-input focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] dark:bg-input/30 w-full min-w-0 overflow-hidden rounded-md border bg-transparent",
        ariaInvalid && "border-destructive ring-destructive/20",
        className,
      )}
    >
      <div ref={parentRef} />
      {!loaded &&
        (failed ? (
          // The chunk did not load (offline, an old page after an
          // update): a plain text area still edits the value.
          <textarea
            id={id}
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            aria-label={ariaLabel}
            readOnly={readOnly}
            placeholder={placeholder}
            spellCheck={false}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="block min-h-30 w-full resize-y bg-transparent px-3 py-2 font-mono text-xs leading-relaxed outline-none"
          />
        ) : (
          <pre
            aria-busy="true"
            className="min-h-30 whitespace-pre-wrap px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground"
          >
            {value || placeholder}
          </pre>
        ))}
    </div>
  );
}

export { CodeEditor };
