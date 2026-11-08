import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Card } from "@/components/analytics/parts";
import { FormField } from "@/components/content-editor/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageBody } from "@/components/ui/page-header";
import { useDiscover } from "@/hooks/use-discover";
import {
  type Profile,
  useChangePassword,
  useUpdateProfile,
} from "@/hooks/use-profile";
import { applyFieldErrors, getFieldErrors } from "@/lib/server-errors";
import { cn, getErrorMessage } from "@/lib/utils";

import { ProfileCard, ProfileHeader } from "./profile-header";

/**
 * The edit tab: the site's profile fields, saved from the header, and
 * the password, changed in a dialog so password managers leave the
 * page's fields alone.
 */
export function EditProfile({ profile }: { profile?: Profile }) {
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const { mutateAsync: save, isPending } = useUpdateProfile();
  const form = useForm<Record<string, unknown>>({
    defaultValues: profile?.values ?? {},
  });
  const userModelLabel = discover?.user_model?.toLowerCase();
  const model = discover?.models.find((m) => m.label === userModelLabel);
  const fields = profile?.fields ?? [];
  const editable = fields.filter((field) => !field.readonly);

  // The saved values are the form's baseline. A refetch (such as on
  // returning to the tab) keeps what the editor is typing.
  useEffect(() => {
    if (profile) {
      form.reset(profile.values, { keepDirtyValues: true });
    }
  }, [profile, form]);

  async function onSubmit(values: Record<string, unknown>) {
    const changed = Object.fromEntries(
      editable.map((field) => [field.name, values[field.name]]),
    );

    try {
      const saved = await save(changed);
      form.reset(saved.values);
      toast.success(t("profile.saved"));
    } catch (e: unknown) {
      if (!applyFieldErrors(e, form.setError as never)) {
        toast.error(getErrorMessage(e));
      }
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ProfileHeader
        current="/profile/edit"
        actions={
          editable.length > 0 && (
            <Button
              className="min-w-20"
              disabled={!profile || !form.formState.isDirty}
              isLoading={isPending}
              onClick={() => form.handleSubmit(onSubmit)()}
            >
              {t("common.save")}
            </Button>
          )
        }
      />
      <PageBody className="space-y-5">
        <ProfileCard user={profile?.user} />
        {profile && (
          <div className="grid gap-5 lg:grid-cols-2 items-start">
            {fields.length > 0 && model && (
              <Card title={t("profile.details")}>
                <Form {...form}>
                  <form
                    className="border-t p-4 grid gap-4 sm:grid-cols-2"
                    onSubmit={form.handleSubmit(onSubmit)}
                  >
                    {fields.map((field) => (
                      <div
                        key={field.name}
                        className={cn(field.col_span > 1 && "sm:col-span-2")}
                      >
                        <FormField formField={field} model={model} />
                      </div>
                    ))}
                    {/* Enter in a field saves, like the header's button. */}
                    <button type="submit" hidden />
                  </form>
                </Form>
              </Card>
            )}
            {profile.password && <PasswordCard />}
          </div>
        )}
      </PageBody>
    </div>
  );
}

function PasswordCard() {
  const { t } = useTranslation();

  return (
    <Card title={t("profile.password.title")}>
      <div className="border-t p-4 flex flex-wrap items-center gap-4">
        <p className="flex-1 min-w-48 text-sm text-muted-foreground">
          {t("profile.password.description")}
        </p>
        <PasswordDialog />
      </div>
    </Card>
  );
}

const EMPTY = { current_password: "", new_password: "", confirm: "" };

type PasswordErrors = Partial<Record<keyof typeof EMPTY, string>>;

/** The password change: current password, then the new one twice. */
function PasswordDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<PasswordErrors>({});
  const { mutateAsync: change, isPending } = useChangePassword();

  function update(name: keyof typeof EMPTY, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }

  async function submit() {
    if (values.new_password !== values.confirm) {
      setErrors({ confirm: t("profile.password.mismatch") });
      return;
    }

    try {
      await change({
        current_password: values.current_password,
        new_password: values.new_password,
      });
      toast.success(t("profile.password.changed"));
      setOpen(false);
    } catch (e: unknown) {
      const fieldErrors = getFieldErrors(e);

      if (!fieldErrors) {
        toast.error(getErrorMessage(e));
        return;
      }

      setErrors(
        Object.fromEntries(
          Object.entries(fieldErrors).map(([key, messages]) => [
            key,
            Array.isArray(messages) ? messages.join(" ") : String(messages),
          ]),
        ),
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Nothing typed is kept for the next time.
        setValues(EMPTY);
        setErrors({});
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">{t("profile.password.change")}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("profile.password.change")}</DialogTitle>
          <DialogDescription>
            {t("profile.password.dialog_description")}
          </DialogDescription>
        </DialogHeader>
        <form
          id="change-password"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <PasswordInput
            name="current_password"
            label={t("profile.password.current")}
            autoComplete="current-password"
            value={values.current_password}
            error={errors.current_password}
            onChange={update}
          />
          <PasswordInput
            name="new_password"
            label={t("profile.password.new")}
            autoComplete="new-password"
            value={values.new_password}
            error={errors.new_password}
            onChange={update}
          />
          <PasswordInput
            name="confirm"
            label={t("profile.password.confirm")}
            autoComplete="new-password"
            value={values.confirm}
            error={errors.confirm}
            onChange={update}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="change-password"
            isLoading={isPending}
            disabled={
              !values.current_password ||
              !values.new_password ||
              !values.confirm
            }
          >
            {t("profile.password.change")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasswordInput({
  name,
  label,
  autoComplete,
  value,
  error,
  onChange,
}: {
  name: keyof typeof EMPTY;
  label: string;
  autoComplete: string;
  value: string;
  error?: string;
  onChange(name: keyof typeof EMPTY, value: string): void;
}) {
  const id = `password-${name}`;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="password"
        autoComplete={autoComplete}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(name, event.target.value)}
      />
      {error && (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
