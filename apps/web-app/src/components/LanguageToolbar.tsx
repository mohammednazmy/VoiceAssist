import { LocaleSwitcher } from "@voiceassist/ui";
import { useLanguageContext } from "../contexts/LanguageContext";

export function LanguageToolbar() {
  const { supportedLanguages } = useLanguageContext();

  return (
    <div className="fixed right-3 top-3 z-[1500] rounded-full bg-white/90 px-3 py-2 shadow-md backdrop-blur dark:bg-slate-900/90">
      <LocaleSwitcher languages={supportedLanguages} />
    </div>
  );
}
