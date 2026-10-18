# InputOTP

One box per character for a short code, such as the code in a password reset email.

- Group the slots in the code's own chunks, with `InputOTPSeparator` between groups.
- `maxLength` is the code's length; paste fills every slot at once.
- Say where the code comes from above the field: "Enter the code from the email."

The consumer provides `maxLength`, the slots and `value`/`onChange`.
