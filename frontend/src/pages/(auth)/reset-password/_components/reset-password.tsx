import { useMutation, useQuery } from "@tanstack/react-query";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import * as R from "ramda";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PiEyeBold, PiEyeClosedBold, PiLockBold } from "react-icons/pi";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { useHttp } from "@/hooks/use-http";
import { getErrorMessage } from "@/lib/utils";

export function ResetPassword() {
  const { t } = useTranslation();
  const http = useHttp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const {
    mutate,
    isPending,
    error: submissionError,
  } = useMutation({
    async mutationFn({ code, password }: { code: string; password: string }) {
      try {
        await http.post("/password-reset/submit", {
          email: searchParams.get("email"),
          code,
          password,
        });
        toast.success(t("reset_password.success_message"));
        navigate("/login", { replace: true });
      } catch (e: unknown) {
        throw new Error(getErrorMessage(e));
      }
    },
  });

  const {
    data: validCode,
    isFetching,
    error: validationError,
  } = useQuery({
    enabled: code.length === 6,
    retry: false,
    queryKey: ["password-reset", "code", code],
    async queryFn() {
      try {
        await http.post("/password-reset/code", {
          code,
        });
        return true;
      } catch (e: unknown) {
        throw new Error(getErrorMessage(e));
      }
    },
  });
  const error = submissionError ?? validationError;

  return (
    <div className="w-full max-w-md flex-1 flex flex-col items-center justify-center">
      <h1 className="text-xl font-bold text-gray-700 text-center">
        {t("reset_password.title")}
      </h1>
      <div className="text-gray-500 text-center mb-12">
        {t("reset_password.subtitle")}
      </div>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription className="justify-center">
            {error.message}
          </AlertDescription>
        </Alert>
      )}

      <form className="border border-gray-300 rounded-lg bg-background p-4 space-y-4 w-full shadow-sm shadow-gray-900/5">
        <div className="relative flex flex-col gap-3 items-center justify-center">
          <Label>{t("reset_password.enter_code")}</Label>
          <InputOTP
            maxLength={6}
            pattern={REGEXP_ONLY_DIGITS}
            onChange={setCode}
            disabled={isFetching || validCode}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        {validCode && (
          <>
            <div className="relative flex items-center mb-6">
              <PiLockBold className="size-4 stroke-gray-400 absolute left-3" />
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    mutate({ password, code });
                  }
                }}
                type={passwordVisible ? "text" : "password"}
                placeholder={t("reset_password.password_placeholder")}
                className="px-9"
                disabled={isPending}
              />
              <button
                className="z-10 absolute right-3 hover:cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  setPasswordVisible(R.not);
                }}
              >
                {passwordVisible ? (
                  <PiEyeClosedBold className="size-4 stroke-gray-600" />
                ) : (
                  <PiEyeBold className="size-4 stroke-gray-600" />
                )}
              </button>
            </div>

            <Button
              className="w-full mb-2"
              disabled={isPending || !code || !password}
              onClick={(e) => {
                e.preventDefault();
                mutate({ code, password });
              }}
            >
              {t("reset_password.submit")}
            </Button>
          </>
        )}
      </form>
    </div>
  );
}
