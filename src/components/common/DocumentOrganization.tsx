import React, { useEffect, useId, useState } from 'react';
import { Star, Tag, X } from 'lucide-react';
import type { DocumentMetadata } from '@/types';
import { normalizeTags, workshop, type OrganizationPatch } from '@/utils/organization';

interface Props {
  document: DocumentMetadata;
  tags: string[];
  busy: boolean;
  onUpdate: (id: string, patch: OrganizationPatch) => Promise<boolean>;
}
export const DocumentOrganization: React.FC<Props> = ({ document, tags, busy, onUpdate }) => {
  const [draft, setDraft] = useState('');
  const suggestions = useId();
  useEffect(() => setDraft(''), [document.id]);
  const favorite = workshop(document).favorite;
  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    if (await onUpdate(document.id, { tags: normalizeTags([...document.tags, ...draft.split(',')]) })) setDraft('');
  };
  return <div className="border-b border-border/60 bg-card/20 px-5 py-2 shrink-0 flex flex-wrap items-start gap-3">
    <button disabled={busy} aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={favorite}
      onClick={() => onUpdate(document.id, { favorite: !favorite })}
      className="flex items-center gap-1.5 text-xs text-primary py-1 disabled:opacity-50">
      <Star className="w-4 h-4" fill={favorite ? 'currentColor' : 'none'} />{favorite ? 'Favorite' : 'Favorite this document'}
    </button>
    <details className="flex-1 min-w-0 text-xs text-muted-foreground">
      <summary className="cursor-pointer py-1 w-fit break-words"><Tag className="inline w-3 h-3 mr-1.5" />Tags{document.tags.length ? ` · ${document.tags.length}` : ' · Add tags'}</summary>
      <div className="flex flex-wrap gap-1.5 my-2 max-h-32 overflow-y-auto">
        {document.tags.map(tag => <span key={tag} className="inline-flex max-w-full items-center gap-1 rounded bg-primary/10 text-foreground px-2 py-1">
          <span className="break-all">{tag}</span><button disabled={busy} aria-label={`Remove tag ${tag}`} onClick={() => onUpdate(document.id, { tags: document.tags.filter(value => value !== tag) })} className="p-0.5 disabled:opacity-50"><X className="w-3 h-3" /></button>
        </span>)}
      </div>
      <form onSubmit={add} className="flex gap-2 mb-2 max-w-md">
        <input aria-label="New document tags" list={suggestions} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Add a tag, or several with commas" disabled={busy}
          className="min-w-0 flex-1 px-2 py-1.5 bg-background text-foreground border border-border rounded focus:outline-primary" />
        <datalist id={suggestions}>{tags.filter(tag => !document.tags.includes(tag)).map(tag => <option key={tag} value={tag} />)}</datalist>
        <button disabled={busy || !draft.trim()} className="px-3 py-1 border border-primary/40 rounded text-primary disabled:opacity-50">Add</button>
      </form>
    </details>
  </div>;
};
