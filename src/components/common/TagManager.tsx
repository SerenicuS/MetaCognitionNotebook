import React, { useState } from 'react';
import { Modal } from './Modal';

interface Props { tags: string[]; busy: boolean; onClose: () => void; onChange: (oldName: string, newName?: string) => Promise<boolean> }
const TagRow: React.FC<{ tag: string; busy: boolean; onChange: Props['onChange'] }> = ({ tag, busy, onChange }) => {
  const [name, setName] = useState(tag);
  const [remove, setRemove] = useState(false);
  return <div className="py-3 border-b border-border/50">
    <form className="flex gap-2 items-center" onSubmit={event => { event.preventDefault(); void onChange(tag, name.trim()); }}>
      <input aria-label={`Rename tag ${tag}`} value={name} onChange={event => setName(event.target.value)} disabled={busy} className="min-w-0 flex-1 rounded px-2 py-1.5 bg-background border border-border text-sm text-foreground focus:outline-primary" />
      <button disabled={busy || !name.trim() || name.trim() === tag} className="text-xs text-primary disabled:opacity-40 px-1">Rename</button>
      <button type="button" disabled={busy} onClick={() => setRemove(!remove)} className="text-xs text-muted-foreground hover:text-rose-500 px-1">Remove</button>
    </form>
    {remove && <div className="mt-2 text-xs text-muted-foreground">
      <p>Remove “{tag}” from every document? Your writing will stay intact.</p>
      <div className="flex gap-3 mt-2"><button disabled={busy} onClick={() => onChange(tag)} className="text-rose-500">Remove everywhere</button><button onClick={() => setRemove(false)}>Cancel</button></div>
    </div>}
  </div>;
};
export const TagManager: React.FC<Props> = ({ tags, busy, onClose, onChange }) => <Modal isOpen onClose={onClose} title="Manage tags" description="Rename or remove a tag across your library. Renaming to an existing tag combines their assignments.">
  <div className="max-h-[55vh] overflow-y-auto">
    {tags.length ? tags.map(tag => <TagRow key={tag} tag={tag} busy={busy} onChange={onChange} />) : <p className="text-sm text-muted-foreground">No tags yet. Add one from any document’s Tags control.</p>}
  </div>
  {busy && <p role="status" className="text-xs text-primary mt-3">Changes are saving or awaiting retry. Use Ctrl+S to retry a failed update.</p>}
</Modal>;
