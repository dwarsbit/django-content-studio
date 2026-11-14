import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PiEyeBold, PiEyeClosedBold, PiLockBold } from "react-icons/pi";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

import { useAuth } from "@/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useHttp } from "@/hooks/use-http";
import { getFieldErrors } from "@/lib/server-errors";
import { getErrorMessage } from "@/lib/utils";

interface LinkUser {
  username: string;
  name: string;
  // The user never logged in: the link is their invite.
  invite: boolean;
}

/**
 * The page an emailed link opens (an invite, or a link an admin sent):
 * choose a password, which logs the user in.
 */
export function SetPasswordPage() {
  const { t } = useTranslation();
  const http = useHttp();
  const navigate = useNavigate();
  const { setToken } = useAuth();
  const [searchParams] = useSearchParams();
  const link = {
    uid: searchParams.get("uid") ?? "",
    token: searchParams.get("token") ?? "",
  };
  const [values, setValues] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>(
    {},
  );
  const [visible, setVisible] = useState(false);

  const { data: user, isPending: isChecking } = useQuery({
    retry: false,
    refetchOnWindowFocus: false,
    queryKey: ["set-password", link],
    async queryFn() {
      try {
        const { data } = await http.post<LinkUser>("/set-password/check", link);
        return data;
      } catch {
        return null;
      }
    },
  });

  const { mutateAsync: submit, isPending } = useMutation({
    async mutationFn(password: string) {
      const { data } = await http.post<{ access: string }>("/set-password", {
        ...link,
        password,
      });
      return data;
    },
  });

  function update(field: "password" | "confirm", value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function onSubmit() {
    if (values.password !== values.confirm) {
      setErrors({ confirm: t("set_password.mismatch") });
      return;
    }

    try {
      const data = await submit(values.password);
      setToken(data.access);
      toast.success(t("set_password.done"));
      navigate("/", { replace: true });
    } catch (e: unknown) {
      const messages = getFieldErrors(e)?.password;

      if (messages) {
        setErrors({
          password: Array.isArray(messages)
            ? messages.join(" ")
            : String(messages),
        });
      } else {
        toast.error(getErrorMessage(e));
      }
    }
  }

  return (
    <div className="w-full max-w-md flex-1 flex flex-col items-center justify-center">
      <img
        src={`${window.DCS_STATIC_PREFIX ?? ""}img/icon.svg`}
        className="size-14 mb-4"
      />
      {isChecking ? (
        <Spinner />
      ) : !user ? (
        <>
          <h1 className="text-xl font-bold text-gray-50 text-center select-none mb-6">
            {t("set_password.title")}
          </h1>
          <Alert variant="destructive" className="mb-4 bg-rose-200 border-none">
            <AlertDescription className="justify-center text-center">
              {t("set_password.invalid")}
            </AlertDescription>
          </Alert>
          <Link to="/login" className="text-sm text-gray-400 hover:underline">
            {t("set_password.to_login")}
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold text-gray-50 text-center select-none">
            {user.invite
              ? t("set_password.welcome", { name: user.name })
              : t("set_password.title")}
          </h1>
          <div className="text-gray-400 text-center mb-12 select-none">
            {t("set_password.subtitle", { username: user.username })}
          </div>
          <form
            className="rounded-xl bg-card p-4 sm:p-8 w-full shadow-xl flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            {/* The username, for password managers to save the new
                password with. */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={user.username}
              readOnly
              hidden
            />
            <PasswordInput
              id="set-password-new"
              label={t("set_password.new")}
              value={values.password}
              visible={visible}
              error={errors.password}
              onChange={(value) => update("password", value)}
              onToggle={() => setVisible((current) => !current)}
            />
            <PasswordInput
              id="set-password-confirm"
              label={t("set_password.confirm")}
              value={values.confirm}
              visible={visible}
              error={errors.confirm}
              onChange={(value) => update("confirm", value)}
            />
            <Button
              type="submit"
              className="w-full mt-2"
              isLoading={isPending}
              disabled={!values.password || !values.confirm}
            >
              {t("set_password.submit")}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}

function PasswordInput({
  id,
  label,
  value,
  visible,
  error,
  onChange,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  error?: string;
  onChange(value: string): void;
  onToggle?: VoidFunction;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-1.5">
      <div className="relative flex items-center">
        <PiLockBold className="size-4 stroke-muted-foreground absolute left-3" />
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          placeholder={label}
          aria-label={label}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="px-9"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {onToggle && (
          <button
            type="button"
            className="z-10 absolute right-3 hover:cursor-pointer"
            aria-label={t(
              visible
                ? "widgets.password_widget.hide"
                : "widgets.password_widget.show",
            )}
            onClick={onToggle}
          >
            {visible ? (
              <PiEyeClosedBold className="size-4 stroke-muted-foreground" />
            ) : (
              <PiEyeBold className="size-4 stroke-muted-foreground" />
            )}
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
