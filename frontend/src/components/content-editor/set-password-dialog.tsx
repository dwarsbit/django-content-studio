import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PiCopyBold,
  PiEyeBold,
  PiEyeSlashBold,
  PiSparkleBold,
} from "react-icons/pi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHttp } from "@/hooks/use-http";
import { generatePassword } from "@/lib/password";
import { getFieldErrors } from "@/lib/server-errors";
import { getErrorMessage } from "@/lib/utils";

const EMPTY = { password: "", confirm: "" };

type Values = typeof EMPTY;

/**
 * Set another user's password: the new one twice, or a generated one
 * shown to copy. Setting it logs the user out on every device.
 */
export function SetPasswordDialog({
  open,
  onOpenChange,
  resourcePath,
  id,
  name,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  // The user model's content endpoint.
  resourcePath: string;
  id: string;
  // The user, as the edit page names them.
  name: string;
}) {
  const { t } = useTranslation();
  const http = useHttp();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Values>>({});
  const [visible, setVisible] = useState(false);
  const { mutateAsync: setPassword, isPending } = useMutation({
    async mutationFn(password: string) {
      await http.post(`${resourcePath}/${id}/password`, { password });
    },
  });

  function reset() {
    // Nothing typed is kept for the next time.
    setValues(EMPTY);
    setErrors({});
    setVisible(false);
  }

  function update(field: keyof Values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function generate() {
    const password = generatePassword();

    setValues({ password, confirm: password });
    setErrors({});
    setVisible(true);
  }

  async function submit() {
    if (values.password !== values.confirm) {
      setErrors({ confirm: t("users.set_password.mismatch") });
      return;
    }

    try {
      await setPassword(values.password);
      toast.success(t("users.set_password.done", { name }));
      onOpenChange(false);
      reset();
    } catch (e: unknown) {
      const fieldErrors = getFieldErrors(e);
      const messages = fieldErrors?.password;

      if (!messages) {
        toast.error(getErrorMessage(e));
        return;
      }

      setErrors({
        password: Array.isArray(messages)
          ? messages.join(" ")
          : String(messages),
      });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("users.set_password.title")}</DialogTitle>
          <DialogDescription>
            {t("users.set_password.description", { name })}
          </DialogDescription>
        </DialogHeader>
        <form
          id="set-password"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <PasswordField
            field="password"
            label={t("users.set_password.new")}
            value={values.password}
            visible={visible}
            error={errors.password}
            onChange={update}
            actions={
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t(
                    visible
                      ? "widgets.password_widget.hide"
                      : "widgets.password_widget.show",
                  )}
                  onClick={() => setVisible((current) => !current)}
                >
                  {visible ? <PiEyeSlashBold /> : <PiEyeBold />}
                </Button>
                {visible && values.password && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("users.set_password.copy")}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(values.password);
                        toast.success(t("users.set_password.copied"));
                      } catch {
                        toast.error(t("users.set_password.copy_failed"));
                      }
                    }}
                  >
                    <PiCopyBold />
                  </Button>
                )}
              </>
            }
          />
          <PasswordField
            field="confirm"
            label={t("users.set_password.confirm")}
            value={values.confirm}
            visible={visible}
            error={errors.confirm}
            onChange={update}
          />
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={generate}
            >
              <PiSparkleBold />
              {t("users.set_password.generate")}
            </Button>
          </div>
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              reset();
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="set-password"
            isLoading={isPending}
            disabled={!values.password || !values.confirm}
          >
            {t("users.set_password.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasswordField({
  field,
  label,
  value,
  visible,
  error,
  actions,
  onChange,
}: {
  field: keyof Values;
  label: string;
  value: string;
  visible: boolean;
  error?: string;
  actions?: React.ReactNode;
  onChange(field: keyof Values, value: string): void;
}) {
  const id = `set-password-${field}`;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-1">
        <Input
          id={id}
          name={field}
          type={visible ? "text" : "password"}
          // Another user's password: password managers should not fill
          // in the editor's own saved one.
          autoComplete="new-password"
          data-1p-ignore
          data-lpignore="true"
          className="font-mono"
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(field, event.target.value)}
        />
        {actions}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
