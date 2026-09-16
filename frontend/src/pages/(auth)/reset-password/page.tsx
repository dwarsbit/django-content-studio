import * as R from "ramda";

import { useAdminInfo } from "@/hooks/use-admin-info";
import { FieldType, LoginBackendType } from "@/types";

import { ResetPassword } from "./_components/reset-password";

export function ResetPasswordPage() {
  const { data: adminInfo } = useAdminInfo();
  const config = adminInfo?.login_backends.find(
    R.whereEq({ type: LoginBackendType.UsernamePassword }),
  )?.config;

  const emailField = config?.username_field_type === FieldType.EmailField;

  return emailField ? (
    <ResetPassword />
  ) : (
    <div>Reset password only works for email usernames.</div>
  );
}
