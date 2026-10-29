import labels from '../../resources/status-labels.json';
import type { PublicationStateChange } from '../services/publication';

export function statusLabel(value: string | null | undefined): string {
  if (value == null || !value.trim()) return 'Unknown';
  return (labels as Record<string, string>)[value.trim().toLowerCase()] || value.trim();
}

/** Also accepts older publication projections which lack assignment_kind. */
export function stateChangeText(change: PublicationStateChange): string {
  const status = change.property_key === 'status' || change.property_key === 'vital_status';
  const display = status ? statusLabel : (value: string) => value;
  const next = display(change.new_value);
  if (change.assignment_kind === 'initial') return `Initial recorded ${change.property_key}: ${next}`;
  if (change.assignment_kind === 'recorded' || (!change.assignment_kind && change.previous_value === 'unassigned')) {
    return `Recorded ${change.property_key}: ${next} (previous value unknown)`;
  }
  return `${change.property_key} changed from ${display(change.previous_value)} to ${next}`;
}
