/**
 * RoleSelector Component
 *
 * A 3-way radio button group for selecting user roles (user, viewer, admin).
 * Includes descriptions for each role to help admins understand permissions.
 */

interface RoleSelectorProps {
  value: "user" | "admin" | "viewer";
  onChange: (role: "user" | "admin" | "viewer") => void;
  disabled?: boolean;
}

const ROLE_OPTIONS: Array<{
  value: "user" | "admin" | "viewer";
  label: string;
  description: string;
}> = [
  {
    value: "user",
    label: "User",
    description: "Standard access to the application",
  },
  {
    value: "viewer",
    label: "Viewer",
    description: "Read-only access to admin panel",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Full system access and management",
  },
];

export function RoleSelector({ value, onChange, disabled }: RoleSelectorProps) {
  return (
    <div className="space-y-3">
      {ROLE_OPTIONS.map((option) => {
        const isSelected = value === option.value;
        return (
          <label
            key={option.value}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              disabled
                ? "opacity-50 cursor-not-allowed"
                : isSelected
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-slate-700 hover:border-slate-600 bg-slate-800/50"
            }`}
          >
            <input
              type="radio"
              name="role"
              value={option.value}
              checked={isSelected}
              onChange={() => onChange(option.value)}
              disabled={disabled}
              className="mt-1 h-4 w-4 text-indigo-500 border-slate-600 bg-slate-800
                focus:ring-indigo-500 focus:ring-offset-0 focus:ring-2"
            />
            <div className="flex-1 min-w-0">
              <div
                className={`font-medium ${isSelected ? "text-indigo-400" : "text-slate-200"}`}
              >
                {option.label}
              </div>
              <div className="text-sm text-slate-400">{option.description}</div>
            </div>
          </label>
        );
      })}
    </div>
  );
}

export default RoleSelector;
