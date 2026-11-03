import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PiEyeBold, PiEyeSlashBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import type {
  ModelField,
  PasswordWidgetOptions,
  WidgetProps,
  WriteOnlyValue,
} from "@/types";

import { ActionInput } from "./typed-input-widgets";

type PasswordValue = string | WriteOnlyValue | null;

const isWriteOnlyValue = (value: unknown): value is WriteOnlyValue =>
  typeof value === "object" && value !== null && "is_set" in value;

/**
 * A secret such as an API key: masked, with a button that shows it.
 *
 * With write_only, the saved value never reaches the editor: the field's
 * value is {is_set}, sent back unchanged to keep it. Typing replaces
 * it, emptying the box keeps the saved value again, and Clear (for an
 * optional field) removes it on save.
 */
export function PasswordWidget({
  field,
  value,
  onChange,
  options = {},
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  field?: ModelField;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
} & WidgetProps<PasswordValue, PasswordWidgetOptions>) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  // The value as the server sent it, to go back to.
  const [saved, setSaved] = useState<WriteOnlyValue | null>(
    isWriteOnlyValue(value) ? value : null,
  );

  if (isWriteOnlyValue(value) && value !== saved) {
    setSaved(value);
  }

  const writeOnly = !!options.write_only;
  const isSet = !!saved?.is_set;
  const isKept = isWriteOnlyValue(value);
  const isCleared = writeOnly && isSet && value === "";
  const text = typeof value === "string" ? value : "";

  const placeholder =
    writeOnly && isSet && isKept
      ? t("widgets.password_widget.saved")
      : isCleared
        ? t("widgets.password_widget.cleared")
        : options.placeholder;

  const handleChange = (next: string) => {
    // An emptied box keeps the saved value.
    onChange(writeOnly && next === "" && saved ? saved : next);
  };

  const toggle = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={t(
        isVisible
          ? "widgets.password_widget.hide"
          : "widgets.password_widget.show",
      )}
      aria-pressed={isVisible}
      onClick={() => setIsVisible((visible) => !visible)}
    >
      {isVisible ? <PiEyeSlashBold /> : <PiEyeBold />}
    </Button>
  );

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <ActionInput
          id={id}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          type={isVisible ? "text" : "password"}
          // Keeps the browser from filling in the editor's own password.
          autoComplete="new-password"
          spellCheck={false}
          value={text}
          placeholder={placeholder}
          onChange={(e) => handleChange(e.target.value)}
          action={toggle}
        />
      </div>
      {writeOnly && isSet && !field?.required && (
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange(isCleared && saved ? saved : "")}
        >
          {isCleared ? t("widgets.password_widget.undo") : t("common.clear")}
        </Button>
      )}
    </div>
  );
}
