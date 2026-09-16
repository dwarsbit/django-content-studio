import * as R from "ramda";

import { useAdminInfo } from "@/hooks/use-admin-info";
import { FieldType, LoginBackendType } from "@/types";

import { ForgotPassword } from "./_components/forgot-password";

export function ForgotPasswordPage() {
  const { data: adminInfo } = useAdminInfo();
  const config = adminInfo?.login_backends.find(
    R.whereEq({ type: LoginBackendType.UsernamePassword }),
  )?.config;

  const emailField = config?.username_field_type === FieldType.EmailField;

  return emailField ? (
    <ForgotPassword />
  ) : (
    <div>Forgot password only works for email usernames.</div>
  );
}
