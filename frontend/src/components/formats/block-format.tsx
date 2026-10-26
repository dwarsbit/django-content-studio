import { useTranslation } from "react-i18next";

export function BlockFormat({ value }: { value: unknown }) {
  const { t } = useTranslation();

  return (
    <span>
      {t("widgets.block_format.count", {
        count: Array.isArray(value) ? value.length : 0,
      })}
    </span>
  );
}
