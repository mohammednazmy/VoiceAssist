import { useTranslation } from "react-i18next";
import { clsx } from "clsx";

export interface LocaleOption {
  code: string;
  name: string;
  dir?: "ltr" | "rtl";
}

export interface LocaleSwitcherProps {
  languages: LocaleOption[];
  className?: string;
}

export function LocaleSwitcher({ languages, className }: LocaleSwitcherProps) {
  const { i18n, t } = useTranslation();
  const current = i18n.language;

  const handleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    await i18n.changeLanguage(event.target.value);
  };

  return (
    <label
      className={clsx("inline-flex items-center gap-2 text-sm", className)}
    >
      <span className="sr-only">{t("common.language", "Language")}</span>
      <svg
        aria-hidden
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="h-4 w-4 text-slate-500"
      >
        <path
          fill="currentColor"
          d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 2.14v3.23H8.35a8.03 8.03 0 0 1 2.65-3.23ZM7.1 14A7.9 7.9 0 0 1 6 12c0-.7.09-1.38.26-2h3.74v4H7.1ZM8.35 18.86A8.03 8.03 0 0 1 11 15.64V19.4a8.02 8.02 0 0 1-2.65-.54ZM13 19.4v-3.76a8.03 8.03 0 0 1 2.65 3.23A8.02 8.02 0 0 1 13 19.4Zm3.9-5.4H14.1v-4h3.64c.17.62.26 1.3.26 2 0 .7-.09 1.38-.26 2Zm-.45-6H14.1V4.14c1.4.5 2.6 1.71 3.35 3.86ZM6.99 15h3v2.35a8.03 8.03 0 0 1-3-2.35Zm7.02 2.35V15h3a8.03 8.03 0 0 1-3 2.35Z"
        />
      </svg>
      <select
        aria-label={t("common.language", "Language")}
        className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        onChange={handleChange}
        value={current}
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code} dir={lang.dir}>
            {lang.name}
          </option>
        ))}
      </select>
    </label>
  );
}
