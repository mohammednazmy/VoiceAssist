/**
 * MedicationList Component
 * Displays patient medications with interaction warnings
 *
 * Features:
 * - Drug interaction warnings
 * - Contraindication highlights
 * - Clickable medication items
 * - Accessibility: Keyboard navigable, screen reader friendly
 * - Dark mode support
 *
 * @example
 * ```tsx
 * <MedicationList
 *   medications={[
 *     {
 *       id: '1',
 *       name: 'Aspirin',
 *       dosage: '81mg',
 *       frequency: 'Once daily',
 *       route: 'Oral',
 *       interactions: ['Warfarin'],
 *     },
 *   ]}
 *   onMedicationClick={(med) => console.log(med)}
 * />
 * ```
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

/**
 * Medication data structure
 */
export interface Medication {
  /**
   * Unique identifier
   */
  id: string;

  /**
   * Medication name (generic or brand)
   */
  name: string;

  /**
   * Dosage amount and unit (e.g., "81mg", "500mg")
   */
  dosage: string;

  /**
   * Dosing frequency (e.g., "Once daily", "BID", "PRN")
   */
  frequency: string;

  /**
   * Route of administration (e.g., "Oral", "IV", "Topical")
   */
  route: string;

  /**
   * Date medication was started
   */
  startDate?: Date;

  /**
   * Date medication was/will be stopped
   */
  endDate?: Date;

  /**
   * Prescribing provider name
   */
  prescriber?: string;

  /**
   * Known drug interactions
   */
  interactions?: string[];

  /**
   * Contraindications for this patient
   */
  contraindications?: string[];

  /**
   * Additional notes
   */
  notes?: string;

  /**
   * Whether the medication is currently active
   */
  active?: boolean;
}

/**
 * Medication item variants
 */
const medicationItemVariants = cva("py-3 px-3 rounded-lg transition-colors", {
  variants: {
    status: {
      normal: "hover:bg-neutral-50 dark:hover:bg-neutral-800",
      interaction:
        "bg-warning-50 border-l-4 border-warning-400 dark:bg-warning-950 dark:border-warning-600",
      contraindicated:
        "bg-error-50 border-l-4 border-error-400 dark:bg-error-950 dark:border-error-600",
      inactive: "opacity-60 hover:bg-neutral-50 dark:hover:bg-neutral-800",
    },
    interactive: {
      true: "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
      false: "",
    },
  },
  defaultVariants: {
    status: "normal",
    interactive: false,
  },
});

/**
 * List wrapper variants
 */
const medicationListVariants = cva("", {
  variants: {
    variant: {
      default: "divide-y divide-neutral-200 dark:divide-neutral-700",
      compact: "space-y-1",
      card: "space-y-2",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface MedicationListProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof medicationListVariants> {
  /**
   * Array of medications to display
   */
  medications: Medication[];

  /**
   * Whether to show interaction warnings
   */
  showInteractions?: boolean;

  /**
   * Whether to show contraindication warnings
   */
  showContraindications?: boolean;

  /**
   * Callback when a medication is clicked
   */
  onMedicationClick?: (medication: Medication) => void;

  /**
   * Whether the list is loading
   */
  loading?: boolean;

  /**
   * Number of skeleton items to show when loading
   */
  loadingCount?: number;

  /**
   * Message to show when list is empty
   */
  emptyMessage?: string;

  /**
   * Whether to show the route column
   */
  showRoute?: boolean;

  /**
   * Whether to show the prescriber column
   */
  showPrescriber?: boolean;
}

/**
 * Skeleton loading item
 */
const MedicationItemSkeleton = () => (
  <div className="py-3 px-3 animate-pulse">
    <div className="flex items-center justify-between">
      <div>
        <div className="h-5 w-32 rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="mt-1 h-4 w-24 rounded bg-neutral-200 dark:bg-neutral-700" />
      </div>
      <div className="h-5 w-16 rounded-full bg-neutral-200 dark:bg-neutral-700" />
    </div>
    <div className="mt-1 h-4 w-20 rounded bg-neutral-200 dark:bg-neutral-700" />
  </div>
);

/**
 * Single medication item
 */
interface MedicationItemProps {
  medication: Medication;
  showInteractions: boolean;
  showContraindications: boolean;
  showRoute: boolean;
  showPrescriber: boolean;
  onClick?: () => void;
}

const MedicationItem = React.forwardRef<HTMLLIElement, MedicationItemProps>(
  (
    {
      medication,
      showInteractions,
      showContraindications,
      showRoute,
      showPrescriber,
      onClick,
    },
    ref,
  ) => {
    const hasInteractions = showInteractions && medication.interactions?.length;
    const hasContraindications =
      showContraindications && medication.contraindications?.length;
    const isActive = medication.active !== false;

    // Determine status for styling
    let status: "normal" | "interaction" | "contraindicated" | "inactive" =
      "normal";
    if (!isActive) {
      status = "inactive";
    } else if (hasContraindications) {
      status = "contraindicated";
    } else if (hasInteractions) {
      status = "interaction";
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (onClick && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        onClick();
      }
    };

    // Format dates
    const formatDate = (date?: Date) =>
      date?.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

    return (
      <li
        ref={ref}
        className={cn(
          medicationItemVariants({
            status,
            interactive: !!onClick,
          }),
        )}
        role={onClick ? "button" : "listitem"}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        aria-label={`${medication.name} ${medication.dosage}, ${medication.frequency}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
              {medication.name}
            </span>
            <span className="ml-2 text-sm text-neutral-600 dark:text-neutral-400">
              {medication.dosage}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasContraindications && (
              <span
                className="rounded-full bg-error-100 px-2 py-0.5 text-xs font-medium text-error-800 dark:bg-error-900 dark:text-error-200"
                title={`Contraindications: ${medication.contraindications?.join(", ")}`}
              >
                {medication.contraindications?.length} contraindication
                {medication.contraindications?.length !== 1 ? "s" : ""}
              </span>
            )}
            {hasInteractions && !hasContraindications && (
              <span
                className="rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-800 dark:bg-warning-900 dark:text-warning-200"
                title={`Interactions: ${medication.interactions?.join(", ")}`}
              >
                {medication.interactions?.length} interaction
                {medication.interactions?.length !== 1 ? "s" : ""}
              </span>
            )}
            {!isActive && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                Inactive
              </span>
            )}
          </div>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500 dark:text-neutral-400">
          <span>{medication.frequency}</span>
          {showRoute && <span>· {medication.route}</span>}
          {showPrescriber && medication.prescriber && (
            <span>· Rx: {medication.prescriber}</span>
          )}
          {medication.startDate && (
            <span>· Started: {formatDate(medication.startDate)}</span>
          )}
        </div>

        {/* Show interaction details if present */}
        {hasInteractions && (
          <div className="mt-2 text-xs text-warning-700 dark:text-warning-300">
            <strong>Interacts with:</strong>{" "}
            {medication.interactions?.join(", ")}
          </div>
        )}

        {/* Show contraindication details if present */}
        {hasContraindications && (
          <div className="mt-2 text-xs text-error-700 dark:text-error-300">
            <strong>Contraindicated:</strong>{" "}
            {medication.contraindications?.join(", ")}
          </div>
        )}

        {/* Notes if present */}
        {medication.notes && (
          <div className="mt-2 text-xs italic text-neutral-500 dark:text-neutral-400">
            {medication.notes}
          </div>
        )}
      </li>
    );
  },
);

MedicationItem.displayName = "MedicationItem";

/**
 * MedicationList Component
 */
const MedicationList = React.forwardRef<HTMLDivElement, MedicationListProps>(
  (
    {
      className,
      medications,
      variant,
      showInteractions = true,
      showContraindications = true,
      onMedicationClick,
      loading = false,
      loadingCount = 3,
      emptyMessage = "No medications found",
      showRoute = true,
      showPrescriber = false,
      ...props
    },
    ref,
  ) => {
    // Calculate warnings
    const hasAnyInteractions =
      showInteractions && medications.some((m) => m.interactions?.length);
    const hasAnyContraindications =
      showContraindications &&
      medications.some((m) => m.contraindications?.length);

    return (
      <div ref={ref} className={cn(className)} {...props}>
        {/* Warning banners */}
        {hasAnyContraindications && (
          <div
            className="mb-4 rounded-lg border-2 border-error-300 bg-error-50 p-3 dark:border-error-700 dark:bg-error-950"
            role="alert"
          >
            <strong className="text-error-800 dark:text-error-200">
              Contraindications Detected
            </strong>
            <p className="text-sm text-error-700 dark:text-error-300">
              Review contraindicated medications below
            </p>
          </div>
        )}

        {hasAnyInteractions && !hasAnyContraindications && (
          <div
            className="mb-4 rounded-lg border-2 border-warning-300 bg-warning-50 p-3 dark:border-warning-700 dark:bg-warning-950"
            role="alert"
          >
            <strong className="text-warning-800 dark:text-warning-200">
              Drug Interactions Detected
            </strong>
            <p className="text-sm text-warning-700 dark:text-warning-300">
              Review potential interactions below
            </p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <ul className={cn(medicationListVariants({ variant }))}>
            {Array.from({ length: loadingCount }).map((_, i) => (
              <MedicationItemSkeleton key={i} />
            ))}
          </ul>
        )}

        {/* Empty state */}
        {!loading && medications.length === 0 && (
          <div className="py-8 text-center text-neutral-500 dark:text-neutral-400">
            {emptyMessage}
          </div>
        )}

        {/* Medication list */}
        {!loading && medications.length > 0 && (
          <ul
            className={cn(medicationListVariants({ variant }))}
            role="list"
            aria-label="Medications"
          >
            {medications.map((medication) => (
              <MedicationItem
                key={medication.id}
                medication={medication}
                showInteractions={showInteractions}
                showContraindications={showContraindications}
                showRoute={showRoute}
                showPrescriber={showPrescriber}
                onClick={
                  onMedicationClick
                    ? () => onMedicationClick(medication)
                    : undefined
                }
              />
            ))}
          </ul>
        )}
      </div>
    );
  },
);

MedicationList.displayName = "MedicationList";

export {
  MedicationList,
  MedicationItem,
  medicationListVariants,
  medicationItemVariants,
};
