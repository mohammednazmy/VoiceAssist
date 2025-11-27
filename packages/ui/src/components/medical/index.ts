/**
 * Medical UI Components
 * Healthcare-specific components for clinical interfaces
 *
 * These components are designed for:
 * - Clinical decision support interfaces
 * - Patient monitoring dashboards
 * - Electronic health record (EHR) systems
 * - Medical alert and notification systems
 *
 * Features:
 * - WCAG AA accessibility compliance
 * - High contrast for critical information
 * - Screen reader friendly
 * - Dark mode support
 * - Responsive design
 */

export { VitalSignCard, vitalSignCardVariants } from "./VitalSignCard";
export type { VitalSignCardProps } from "./VitalSignCard";

export {
  MedicationList,
  MedicationItem,
  medicationListVariants,
  medicationItemVariants,
} from "./MedicationList";
export type { MedicationListProps, Medication } from "./MedicationList";

export { AlertBanner, alertBannerVariants } from "./AlertBanner";
export type { AlertBannerProps, AlertAction } from "./AlertBanner";
