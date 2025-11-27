/**
 * Language Selector Component
 * Dropdown for switching between supported languages
 *
 * Phase 9.1: Multi-language support
 */

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supportedLanguages, type LanguageCode } from "../i18n";

interface LanguageSelectorProps {
  variant?: "dropdown" | "inline";
  className?: string;
}

export function LanguageSelector({
  variant = "dropdown",
  className = "",
}: LanguageSelectorProps) {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLanguage = supportedLanguages.find(
    (lang) => lang.code === i18n.language,
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLanguageChange = (langCode: LanguageCode) => {
    i18n.changeLanguage(langCode);
    setIsOpen(false);

    // Update document direction
    document.documentElement.dir =
      supportedLanguages.find((l) => l.code === langCode)?.dir || "ltr";
    document.documentElement.lang = langCode;
  };

  if (variant === "inline") {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        {supportedLanguages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              i18n.language === lang.code
                ? "bg-primary-600 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
            aria-current={i18n.language === lang.code ? "true" : undefined}
          >
            {lang.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-5 h-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802"
          />
        </svg>
        <span>{currentLanguage?.name || "Language"}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute z-50 mt-2 w-40 bg-white border border-neutral-200 rounded-md shadow-lg py-1 ltr:right-0 rtl:left-0"
          role="listbox"
        >
          {supportedLanguages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`w-full px-4 py-2 text-sm text-left hover:bg-neutral-100 flex items-center justify-between ${
                i18n.language === lang.code
                  ? "text-primary-600 font-medium"
                  : "text-neutral-700"
              }`}
              role="option"
              aria-selected={i18n.language === lang.code}
            >
              <span>{lang.name}</span>
              {i18n.language === lang.code && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
