import { useTranslation } from "react-i18next";
import { PiDownloadSimpleBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExportFormat } from "@/types";

/**
 * The export control: a button that downloads the only format, or a
 * menu of the formats (CSV, and Excel when the server can write it).
 */
export function ExportMenu({
  formats,
  onExport,
  label,
  icon,
  disabled,
  variant = "outline",
}: {
  formats: ExportFormat[];
  onExport(format: ExportFormat): void;
  // Defaults to "Export".
  label?: string;
  // A Phosphor class; defaults to the download icon.
  icon?: string | null;
  disabled?: boolean;
  variant?: "outline" | "ghost";
}) {
  const { t } = useTranslation();
  const content = (
    <>
      {icon ? <span className={`${icon} text-sm`} /> : <PiDownloadSimpleBold />}
      {label ?? t("export.button")}
    </>
  );

  if (formats.length === 1) {
    return (
      <Button
        size="sm"
        variant={variant}
        disabled={disabled}
        title={t(`export.${formats[0]}`)}
        onClick={() => onExport(formats[0])}
      >
        {content}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant={variant} disabled={disabled}>
          {content}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.map((format) => (
          <DropdownMenuItem key={format} onSelect={() => onExport(format)}>
            {t(`export.${format}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
