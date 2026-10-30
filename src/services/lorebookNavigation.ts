import type { DocumentMetadata, HouseRecord } from '../types';
import type { Plan } from '../utils/thought';
import { houseUniverses } from '../utils/lorebookNavigation';

export interface LorebookSnapshot { plan: Plan | null; documents: DocumentMetadata[]; houses: HouseRecord[] }

/** Import publication has already committed. A refresh/navigation failure never repeats that commit. */
export async function refreshAndOpenImportedUniverse(universeId: string, houseId: string, dependencies: {
  refresh: () => Promise<LorebookSnapshot | undefined>;
  currentHouse: () => string;
  switchHouse: (id: string) => Promise<boolean>;
  open: (id: string, houseId: string, snapshot: LorebookSnapshot) => Promise<boolean>;
}) {
  const validate = (snapshot: LorebookSnapshot | undefined) => {
    if (!snapshot || !snapshot.houses.some(h => h.id === houseId && !h.archived) ||
        !houseUniverses(snapshot.plan, houseId, snapshot.houses).some(u => u.id === universeId)) {
      throw new Error('Refresh could not confirm the imported Universe in its destination House. The committed import is retained; refresh before opening it.');
    }
    return snapshot;
  };
  let snapshot = validate(await dependencies.refresh());
  if (dependencies.currentHouse() !== houseId) {
    if (!await dependencies.switchHouse(houseId)) throw new Error('House navigation was blocked. The imported Universe remains saved.');
    snapshot = validate(await dependencies.refresh());
  }
  if (!await dependencies.open(universeId, houseId, snapshot)) throw new Error('Save or navigation was blocked. The imported Universe remains saved.');
}
