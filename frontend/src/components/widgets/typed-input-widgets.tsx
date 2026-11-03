import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PiArrowSquareOutBold, PiEnvelopeSimpleBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isSafeHref } from "@/lib/html";
import type { PlaceholderWidgetOptions, WidgetProps } from "@/types";

type TypedInputProps = WidgetProps<string | null, PlaceholderWidgetOptions> & {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/**
 * A text box with an action button inside it, at the end: the box
 * draws the border, so the button sits in the field.
 */
export function ActionInput({
  action,
  ...props
}: ComponentProps<typeof Input> & { action?: ReactNode }) {
  if (!action) {
    return <Input {...props} />;
  }
  return (
    <div className="flex h-9 items-center rounded-md border bg-background pr-1 focus-within:border-ring">
      <Input {...props} className="h-full flex-1 border-0 bg-transparent" />
      {action}
    </div>
  );
}

function inputProps({
  value,
  onChange,
  options = {},
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: TypedInputProps) {
  return {
    id,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    value: value ?? "",
    placeholder: options.placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange(e.target.value),
  };
}

/** An email address, with a button that writes to it. */
export function EmailWidget(props: TypedInputProps) {
  const { t } = useTranslation();
  const email = (props.value ?? "").trim();

  return (
    <ActionInput
      {...inputProps(props)}
      type="email"
      autoComplete="off"
      action={
        email && (
          <Button asChild variant="ghost" size="icon-sm">
            <a
              href={`mailto:${email}`}
              title={t("widgets.email_widget.send")}
              aria-label={t("widgets.email_widget.send")}
            >
              <PiEnvelopeSimpleBold />
            </a>
          </Button>
        )
      }
    />
  );
}

/** A web address, with a button that opens it in a new tab. */
export function URLWidget(props: TypedInputProps) {
  const { t } = useTranslation();
  const url = (props.value ?? "").trim();
  // Only a full http(s) address opens: a relative one has no site to
  // open on, and other schemes could run script.
  const canOpen = /^https?:\/\/\S+/i.test(url) && isSafeHref(url);

  return (
    <ActionInput
      {...inputProps(props)}
      type="url"
      autoComplete="off"
      placeholder={props.options?.placeholder ?? "https://"}
      action={
        canOpen && (
          <Button asChild variant="ghost" size="icon-sm">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={t("widgets.url_widget.open")}
              aria-label={t("widgets.url_widget.open")}
            >
              <PiArrowSquareOutBold />
            </a>
          </Button>
        )
      }
    />
  );
}

/** A phone number: phones show the number pad. */
export function PhoneWidget(props: TypedInputProps) {
  return <Input {...inputProps(props)} type="tel" autoComplete="tel" />;
}
