import { emptyPlan, newNode } from '../../src/utils/thought';
import { house, loreDoc } from './lorebookNavigation';

export function echoFixture() {
  const plan = emptyPlan();
  plan.universes = [{ id: 'u', name: 'Echo world' }, { id: 'foreign', name: 'Foreign world' }];
  plan.books = [{ id: 'book', name: 'Disposable Book', universe_id: 'u', continuity: 'canonical' }];
  const houses = [house('house-default', 'Writing', ['u']), house('foreign-house', 'Foreign', ['foreign'])];
  const doc = (id: string, title: string, extra = {}) => loreDoc(id, { universe_id: 'u', entry_type: 'character', ...extra }, { title });
  const documents = [
    doc('source', 'Draft chapter', { entry_type: 'chapter', book_id: 'book', chapter_order: 1, milestone_id: 'milestone' }),
    doc('abyssals', 'Abyssals', { character_fields: { aliases: ['Colorless Ones', '深渊族'] } }),
    doc('land', 'Vibrant Land', { entry_type: 'location' }),
    doc('empyreans', 'Empyreans'),
    doc('twin-one', 'Twins'), doc('twin-two', 'Twins'),
    doc('archived', 'Archived One', { archived: true }),
    doc('missing', 'Missing One'), doc('failing', 'Failing One'),
    loreDoc('foreign-entry', { universe_id: 'foreign', entry_type: 'character' }, { title: 'Foreign Secret', house_id: 'foreign-house' }),
  ];
  plan.nodes = [{ ...newNode(plan, 'u', null), id: 'milestone', title: 'Chapter moment', changes: [
    { id: 'state-a', entity_id: 'abyssals', property_key: 'status', previous_value: null, new_value: 'alive', note: 'At the original chapter' },
    { id: 'state-b', entity_id: 'land', property_key: 'status', previous_value: null, new_value: 'ruined', note: 'At the original chapter' },
  ] }];
  plan.relationships = [
    { id: 'allowed', universe_id: 'u', book_id: null, context_node_id: null, source_id: 'abyssals', target_id: 'twin-two', label: 'knows', description: 'A deliberate UUID relationship', directed: true, archived: false },
    { id: 'denied', universe_id: 'u', book_id: null, context_node_id: null, source_id: 'abyssals', target_id: 'foreign-entry', label: 'secret', description: 'MUST NOT LEAK', directed: true, archived: false },
  ];
  const draft = 'Abyssals and Colorless Ones. This is an unsaved writing draft.\n\n' + 'Writing stays here.\n'.repeat(100);
  const bodies: Record<string, string> = {
    source: draft,
    abyssals: '### Overview\n\nThe Abyssals seek to reclaim the **Vibrant Land**. Empyreans oppose them. Twins, Missing One, and Failing One are mentioned. Foreign Secret and Archived One must remain ordinary text.\n\n`Empyreans` and [link](https://example.invalid/Empyreans) remain inert. <img src="Empyreans" onerror="alert(1)">\n\n' + 'Long lore paragraph about Vibrant Land.\n\n'.repeat(90),
    land: '### Overview\n\nVibrant Land remembers *Empyreans* and Abyssals.',
    empyreans: '### Overview\n\nEmpyreans remember Abyssals. Twins share the land.',
    'twin-one': 'The first Twins entry.', 'twin-two': 'The second Twins entry.', failing: 'Recovered entry.',
  };
  return { plan, houses, documents, draft, bodies };
}
