import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it, vi } from "vitest";

import { applyFieldErrors, getFieldErrors } from "@/lib/server-errors";
import { getErrorMessage } from "@/lib/utils";

function responseError(status: number, data: unknown) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("Request failed", String(status), config, null, {
    status,
    statusText: "",
    headers: {},
    config,
    data,
  });
}

describe("applyFieldErrors", () => {
  it("sets a 400 field-error map on the form", () => {
    const setError = vi.fn();
    const error = responseError(400, {
      title: ["Required."],
      body: { "0": { data: { text: ["Too long."] } } },
    });

    expect(applyFieldErrors(error, setError)).toBe(true);
    expect(setError).toHaveBeenCalledWith("title", {
      type: "custom",
      message: "Required.",
    });
    expect(setError).toHaveBeenCalledWith("body.0.data.text", {
      type: "custom",
      message: "Too long.",
    });
  });

  it("reports a 403 detail as a message, not as field errors", () => {
    const setError = vi.fn();
    const error = responseError(403, {
      detail: "Unknown or unauthorized tenant.",
    });

    expect(applyFieldErrors(error, setError)).toBe(false);
    expect(setError).not.toHaveBeenCalled();
    expect(getErrorMessage(error)).toBe("Unknown or unauthorized tenant.");
  });

  it("reports a non-JSON 500 as a message, not as field errors", () => {
    const setError = vi.fn();
    const error = responseError(500, "<html><h1>Server Error</h1></html>");

    expect(applyFieldErrors(error, setError)).toBe(false);
    expect(setError).not.toHaveBeenCalled();
    expect(getErrorMessage(error)).toBe("Error");
  });

  it("ignores a 400 whose body is not a plain object", () => {
    expect(getFieldErrors(responseError(400, ["Not allowed."]))).toBeNull();
    expect(getFieldErrors(responseError(400, "Bad request"))).toBeNull();
    expect(getFieldErrors(new Error("Network"))).toBeNull();
  });
});
