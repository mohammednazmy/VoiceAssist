/**
 * TabGroup - Consistent tab navigation pattern
 */

export interface Tab {
  id: string;
  label: string;
  icon?: string;
  count?: number;
  disabled?: boolean;
}

interface TabGroupProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  size?: "sm" | "md";
  className?: string;
}

export function TabGroup({
  tabs,
  activeTab,
  onTabChange,
  size = "md",
  className = "",
}: TabGroupProps) {
  const sizeClasses = {
    sm: "px-2 py-1.5 text-xs",
    md: "px-3 py-2 text-sm",
  };

  return (
    <div
      className={`flex flex-wrap gap-1 border-b border-slate-800 pb-1 ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            disabled={tab.disabled}
            className={`
              ${sizeClasses[size]}
              font-medium rounded-t-md transition-colors
              flex items-center gap-1.5
              ${
                isActive
                  ? "bg-slate-800 text-slate-100 border-b-2 border-blue-500"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }
              ${tab.disabled ? "opacity-50 cursor-not-allowed" : ""}
            `}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
          >
            {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`
                  ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold
                  ${isActive ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300"}
                `}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
