export type EchoCategory = 'character' | 'location' | 'faction' | 'rule' | 'artifact' | 'event' | 'other';

export interface EchoRelationship {
  targetId: string;
  targetName: string;
  relationType: string;
  targetCategory: EchoCategory;
  categoryKind?: 'guided' | 'custom';
  isDirected?: boolean;
  description?: string;
}

export interface EchoAttribute {
  id: string;
  key: string;
  value: string;
}

export interface EchoHeldOffice {
  factionId: string;
  factionTitle: string;
  positionTitle: string;
  branchName?: string;
  description?: string;
}

export interface EchoFactionPositionSummary {
  id: string;
  title: string;
  branchName?: string;
  holders: string[];
  isVacant: boolean;
}

export interface EchoFactionStructure {
  factionType?: string;
  headquarters?: string;
  leadership?: string;
  positions: EchoFactionPositionSummary[];
}

export interface EchoCharacterProfile {
  age?: string;
  species?: string;
  gender?: string;
  vitalStatus?: string;
  physicalAppearance?: string;
  clothingAttire?: string;
  personality?: string;
  occupation?: string;
  narrativeRole?: string;
}

export interface EchoEntity {
  templateEntryType?: string;
  id: string;
  name: string;
  aliases?: string[];
  category: EchoCategory;
  universe: string;
  universeId: string;
  houseId?: string;
  description: string;
  guidedAttributes: Record<string, string>;
  customAttributes: EchoAttribute[];
  relationships: EchoRelationship[];
  status: 'active' | 'archived';

  // Rich metadata extensions from Phase C1 and C2
  characterProfile?: EchoCharacterProfile;
  heldOffices?: EchoHeldOffice[];
  factionStructure?: EchoFactionStructure;

  // Web of Thought: Living Entity State (Phase W)
  livingState?: import('@/utils/stateEngine').ResolvedLivingEntityState;
}

export interface EchoContextAnchor {
  before: string;
  after: string;
}

export type EchoReferenceStatus = 'active' | 'unresolved' | 'detached';

export interface EchoPersistentReference {
  id: string;
  targetId?: string;
  entityId?: string; // Backward compatibility alias
  from: number;
  to: number;
  matchedText: string;
  anchor?: EchoContextAnchor;
  contextAnchor?: EchoContextAnchor; // Backward compatibility alias
  status?: EchoReferenceStatus;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
}

export type EchoConfirmedReference = EchoPersistentReference;

export interface EchoCandidateMatch {
  from: number;
  to: number;
  matchedText: string;
  matchingEntities: EchoEntity[];
  isAmbiguous: boolean;
  isAliasMatch?: boolean;
}

export interface EchoPopupState {
  isOpen: boolean;
  entity: EchoEntity | null;
  position: { top: number; left: number };
  from: number;
  to: number;
  referenceId?: string;
}

export interface EchoClarificationState {
  isOpen: boolean;
  matchedText: string;
  candidates: EchoEntity[];
  from: number;
  to: number;
  position: { top: number; left: number };
}

export interface EchoHistoricalContextData {
  universeId: string;
  milestoneId: string;
  milestoneTitle: string;
  milestoneEra?: string;
  continuityName: string;
  branchId?: string | null;
  resolvedState: import('@/utils/stateEngine').ResolvedEntityState;
  onNavigateWebOfThought?: (
    universeId: string,
    continuityId: string | null,
    milestoneId: string | null,
    entityId: string | null
  ) => void;
}
