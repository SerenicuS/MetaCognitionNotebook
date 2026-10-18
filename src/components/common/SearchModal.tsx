import React, { useState, useEffect, useRef } from 'react';
import { Search, CornerDownLeft, Sparkles } from 'lucide-react';
import { DocumentType, SearchResult } from '@/types';
import { StudioIcon } from '@/components/common/BrandIcon';
import { api } from '@/services/api';
import { cn } from '@/utils/cn';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDocument: (id: string, docType: DocumentType) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, onSelectDocument }) => {
  const [query, setQuery] = useState('');
  const [selectedType, setSelectedType] = useState<DocumentType | 'all'>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const typeFilter = selectedType === 'all' ? undefined : selectedType;
        const res = await api.searchDocuments(query, typeFilter);
        setResults(res);
        setSelectedIndex(0);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query, selectedType]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      const target = results[selectedIndex];
      if (target) {
        onSelectDocument(target.id, target.doc_type);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-2xl rounded-xl bg-card border border-border shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4.5 py-3.5 border-b border-border bg-muted/20">
          <Search className="w-5 h-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search documents by title, concepts, lines..."
            className="w-full bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {loading && <Sparkles className="w-4 h-4 text-primary animate-pulse shrink-0" />}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 px-4.5 py-2.5 border-b border-border/50 text-xs bg-muted/10">
          <span className="text-muted-foreground mr-1 text-xs font-medium">Filter:</span>
          {(['all', 'poetry', 'philosophy', 'lorebook'] as const).map(type => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={cn(
                'px-3 py-1 rounded-md font-medium capitalize text-xs transition-colors',
                selectedType === type
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              )}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div className="max-h-84 overflow-y-auto p-2.5 divide-y divide-border/20">
          {results.length === 0 && query.trim() && !loading && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No matching documents found in library.
            </div>
          )}

          {results.length === 0 && !query.trim() && (
            <div className="py-10 text-center text-xs text-muted-foreground">
              Type keywords to search across poetry stanzas, philosophical treatises, and lorebooks.
            </div>
          )}

          {results.map((res, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={res.id}
                onClick={() => {
                  onSelectDocument(res.id, res.doc_type);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={cn(
                  'flex items-start gap-3.5 p-3 rounded-xl cursor-pointer transition-colors border',
                  isSelected ? 'bg-accent/80 border-primary/40 text-foreground shadow-sm' : 'border-transparent text-foreground/90 hover:bg-accent/40'
                )}
              >
                <div className="mt-0.5 shrink-0">
                  <StudioIcon type={res.doc_type} isActive={isSelected} className="w-8 h-8 rounded-md" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-semibold text-[15px] truncate tracking-wide">{res.title}</span>
                    <span className="text-[11px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {res.doc_type}
                    </span>
                    <span className="text-xs text-muted-foreground/60 ml-auto truncate">
                      {res.relative_path}
                    </span>
                  </div>
                  <p className="text-[13px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                    {res.snippet}
                  </p>
                </div>

                {isSelected && (
                  <CornerDownLeft className="w-4 h-4 text-primary self-center shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4.5 py-2.5 border-t border-border bg-muted/30 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>MetaCognition Universal Search</span>
        </div>
      </div>
    </div>
  );
};
