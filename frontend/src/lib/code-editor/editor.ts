/**
 * The code editor (CodeMirror), loaded on demand by
 * components/ui/code-editor.tsx: only pages with a code field download
 * it. Keep this module free of imports from the app, so its chunk
 * holds CodeMirror alone and never imports the main bundle back.
 */
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { linter, lintGutter } from "@codemirror/lint";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderText,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

// Mirrors CodeLanguage in types.ts (not imported: see above).
export type CodeLanguage = "css" | "html" | "javascript" | "json";

export interface CodeEditorOptions {
  value: string;
  language?: CodeLanguage | null;
  readOnly?: boolean;
  placeholder?: string;
  // The editable element's attributes, for its label and help text.
  attributes?: Record<string, string>;
  onChange(value: string): void;
}

export interface CodeEditorHandle {
  setValue(value: string): void;
  setReadOnly(readOnly: boolean): void;
  setAttributes(attributes: Record<string, string>): void;
  destroy(): void;
}

// Colors come from the --code-* variables in index.css, so the editor
// follows the light and dark theme without being reconfigured.
const highlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.operatorKeyword, tags.modifier],
    color: "var(--code-keyword)",
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp],
    color: "var(--code-string)",
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    color: "var(--code-number)",
  },
  {
    tag: [tags.propertyName, tags.attributeName],
    color: "var(--code-property)",
  },
  {
    tag: [tags.tagName, tags.typeName, tags.className],
    color: "var(--code-tag)",
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "var(--code-function)",
  },
  {
    tag: [tags.comment, tags.meta],
    color: "var(--code-comment)",
    fontStyle: "italic",
  },
  { tag: tags.invalid, color: "var(--destructive)" },
]);

const theme = EditorView.theme({
  "&": {
    color: "var(--foreground)",
    backgroundColor: "transparent",
    fontSize: "12px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    lineHeight: "1.6",
    minHeight: "7.5rem",
    maxHeight: "32rem",
  },
  ".cm-content": { caretColor: "var(--foreground)", padding: "8px 0" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--muted-foreground)",
    border: "none",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "color-mix(in oklab, var(--foreground) 4%, transparent)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
    {
      backgroundColor:
        "color-mix(in oklab, var(--ring) 35%, transparent) !important",
    },
  ".cm-matchingBracket": {
    backgroundColor: "color-mix(in oklab, var(--ring) 30%, transparent)",
    outline: "none",
  },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
  },
  ".cm-diagnostic-error": { borderLeftColor: "var(--destructive)" },
});

function languageExtension(language: CodeLanguage | null | undefined) {
  switch (language) {
    case "css":
      return css();
    case "html":
      return html();
    case "javascript":
      return javascript();
    case "json":
      // Invalid JSON is underlined where the parser stops.
      return [json(), linter(jsonParseLinter(), { delay: 300 }), lintGutter()];
    default:
      return [];
  }
}

export function createCodeEditor(
  parent: HTMLElement,
  options: CodeEditorOptions,
): CodeEditorHandle {
  const readOnly = new Compartment();
  const attributes = new Compartment();
  // Set while the value is replaced from outside, so that change is not
  // reported back as an edit.
  let replacing = false;

  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    syntaxHighlighting(highlightStyle),
    // Tab indents; Escape, then Tab, leaves the editor.
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    theme,
    languageExtension(options.language),
    readOnly.of(EditorState.readOnly.of(!!options.readOnly)),
    attributes.of(EditorView.contentAttributes.of(options.attributes ?? {})),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !replacing) {
        options.onChange(update.state.doc.toString());
      }
    }),
  ];

  if (options.placeholder) {
    extensions.push(placeholderText(options.placeholder));
  }

  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: options.value, extensions }),
  });

  return {
    setValue(value) {
      const current = view.state.doc.toString();

      if (value === current) {
        return;
      }

      replacing = true;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
      replacing = false;
    },
    setReadOnly(value) {
      view.dispatch({
        effects: readOnly.reconfigure(EditorState.readOnly.of(value)),
      });
    },
    setAttributes(value) {
      view.dispatch({
        effects: attributes.reconfigure(EditorView.contentAttributes.of(value)),
      });
    },
    destroy() {
      view.destroy();
    },
  };
}
