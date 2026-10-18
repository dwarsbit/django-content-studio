import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PiEnvelopeBold } from "react-icons/pi";
import { Link, useNavigate } from "react-router";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHttp } from "@/hooks/use-http";
import { getErrorMessage } from "@/lib/utils";

export function ForgotPassword() {
  const { t } = useTranslation();
  const http = useHttp();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const { mutate, isPending, error } = useMutation({
    async mutationFn(email: string) {
      try {
        await http.post("/password-reset/request", { email });
        navigate(`/reset-password?email=${email}`);
      } catch (e: unknown) {
        throw new Error(getErrorMessage(e), { cause: e });
      }
    },
  });

  return (
    <div className="w-full max-w-md flex-1 flex flex-col items-center justify-center">
      <h1 className="text-xl font-bold text-gray-50 text-center select-none">
        {t("forgot_password.title")}
      </h1>
      <div className="text-gray-400 text-center mb-12 select-none">
        {t("forgot_password.subtitle")}
      </div>
      {error && (
        <Alert variant="destructive" className="mb-4 bg-rose-200 border-none">
          <AlertDescription className="justify-center">
            {error.message}
          </AlertDescription>
        </Alert>
      )}
      <form className="rounded-xl bg-card p-4 sm:p-8 w-full shadow-xl">
        <div className="relative flex items-center mb-4">
          <PiEnvelopeBold className="size-4 stroke-muted-foreground absolute left-3" />
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder={t("forgot_password.email_placeholder")}
            className="px-9"
            disabled={isPending}
          />
        </div>

        <Button
          className="w-full mb-2"
          disabled={isPending || !email}
          onClick={(e) => {
            e.preventDefault();
            mutate(email);
          }}
        >
          {t("forgot_password.submit")}
        </Button>
        <div className="text-center">
          <Link to="/login" className="text-sm hover:underline">
            {t("forgot_password.login")}
          </Link>
        </div>
      </form>
    </div>
  );
}
