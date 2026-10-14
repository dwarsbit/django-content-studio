import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FocusPointValue } from "@/types";

export function FocusPointField({
  value,
  onChange,
  image,
  className,
}: {
  // The item's focus point; null leaves it unset.
  value: FocusPointValue | null;
  onChange?(focusPoint: FocusPointValue | null): void;
  image: string;
  className?: string;
}) {
  const { t } = useTranslation();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    onChange?.({
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
    });
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="relative">
        <img
          alt=""
          src={image}
          className="w-full rounded select-none"
          draggable={false}
        />
        <button
          type="button"
          aria-label={t("media_library.focus_point.set")}
          className="absolute inset-0 cursor-crosshair rounded"
          onClick={handleClick}
        />
        {value && (
          <span
            className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-2 ring-black/60"
            style={{ left: `${value.x}%`, top: `${value.y}%` }}
          />
        )}
      </div>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => onChange?.(null)}
        >
          {t("media_library.focus_point.remove")}
        </Button>
      )}
    </div>
  );
}
