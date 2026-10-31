import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Sparkles,
  BookOpen,
  Plus,
  Trash2,
  Download,
  Upload,
  Check,
  AlertTriangle,
  RefreshCw,
  FilePlus2,
  ArrowRightLeft,
  Info,
  Shuffle,
  Dices,
  Sliders,
  Database,
  Key,
  Copy,
  Edit3,
  Eye,
  Search,
  ShieldAlert,
  Lock,
  Layers,
  RotateCcw,
} from 'lucide-react';
import {
  CipherMapping,
  CipherKey,
  CipherMode,
  CipherScope,
  StanzaCipherEntry,
  StanzaConflictReport,
  PoemCipherMetadata,
  analyzeWordFrequency,
  decodeWithCipherKey,
  validateCipherKey,
  generateQuickCipher,
  generateRandomCipher,
  createCipherKey,
  createSeededRng,
  computeTextFingerprint,
  formatDefaultCipherKeyName,
  extractBasePoemTitle,
  formatCipheredPoemTitle,
  resolveUniquePoemTitle,
  truncateDisplayLabel,
  classifyCipherKey,
  createCipherPackage,
  validateCipherPackage,
  decodeCipherPackage,
  sanitizePortableFilename,
  encodePoemWithStanzas,
  initializePoemStanzas,
  reconcileStanzaEntries,
  reconcilePoemCipherMetadata,
  cipherMetadataFromKey,
  withCipherRecovery,
  poemStanzasFromMetadata,
  reassignUnresolvedMappings,
  switchCipherScope,
  resolveScopeConflictsAndSwitch,
  MCCIPHER_DISCLOSURE,
} from '@/utils/emotionalCipher';
import { api, VocabularyPoolInfo } from '@/services/api';
import { cn } from '@/utils/cn';

interface EmotionalCipherModalProps {
  isOpen: boolean;
  onClose: () => void;
  poemId?: string;
  poemContent: string;
  poemTitle: string;
  poemMetadataJson?: string | null;
  initialTab?: 'quick' | 'random' | 'manual' | 'decode' | 'keys';
  initialStanzaIndex?: number;
  onCreateNewPoem?: (
    title: string,
    content: string,
    metadataJson?: string,
    tags?: string[]
  ) => Promise<void>;
}

type ActiveTab = 'quick' | 'random' | 'manual' | 'decode' | 'keys';

export const EmotionalCipherModal: React.FC<EmotionalCipherModalProps> = ({
  isOpen,
  onClose,
  poemId,
  poemContent,
  poemTitle,
  poemMetadataJson,
  initialTab,
  initialStanzaIndex,
  onCreateNewPoem,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('quick');
  const [dictionaries, setDictionaries] = useState<CipherKey[]>([]);
  const [selectedDictId, setSelectedDictId] = useState<string>('');
  const [selectedDecodeKeyId, setSelectedDecodeKeyId] = useState<string>('');
  const [dictName, setDictName] = useState<string>('Custom Cipher Key');
  const [dictDescription, setDictDescription] = useState<string>('');
  const [mappings, setMappings] = useState<CipherMapping[]>([
    { original: '', replacement: '' },
  ]);

  // Per-Stanza Cipher Scope State
  const poemStanzas = useMemo(() => {
    let cipher: PoemCipherMetadata | undefined;
    try { cipher = poemMetadataJson ? JSON.parse(poemMetadataJson).cipher : undefined; } catch { /* Plain poem. */ }
    return poemStanzasFromMetadata(poemContent, cipher);
  }, [poemContent, poemMetadataJson]);

  const [cipherScope, setCipherScope] = useState<CipherScope>('whole_poem');
  const [stanzaEntries, setStanzaEntries] = useState<StanzaCipherEntry[]>(() =>
    initializePoemStanzas(poemContent)
  );
  const [activeStanzaIndex, setActiveStanzaIndex] = useState<number>(initialStanzaIndex ?? 0);
  const [unresolvedStanzas, setUnresolvedStanzas] = useState<StanzaCipherEntry[]>([]);
  const [wholePoemBackup, setWholePoemBackup] = useState<PoemCipherMetadata['whole_poem_backup']>(undefined);
  const [perStanzaBackup, setPerStanzaBackup] = useState<StanzaCipherEntry[] | undefined>(undefined);
  const [previewMode, setPreviewMode] = useState<'full_poem' | 'active_stanza'>('full_poem');
  const [conflictReport, setConflictReport] = useState<StanzaConflictReport | null>(null);
  const [conflictChoices, setConflictChoices] = useState<Record<string, string>>({});
  const [isConflictModalOpen, setIsConflictModalOpen] = useState<boolean>(false);

  // Quick Cipher state (deterministic seed per roll)
  const [quickSwapCount, setQuickSwapCount] = useState<number>(4);
  const [quickRollIndex, setQuickRollIndex] = useState<number>(1);
  const [quickKeyName, setQuickKeyName] = useState<string>('');
  const [committedQuickKeys, setCommittedQuickKeys] = useState<Record<number, CipherKey>>({});

  // Random Cipher state
  const [randomTransformCount, setRandomTransformCount] = useState<number>(5);
  const [randomRollIndex, setRandomRollIndex] = useState<number>(1);
  const [randomKeyName, setRandomKeyName] = useState<string>('');
  const [committedRandomKeys, setCommittedRandomKeys] = useState<Record<number, CipherKey>>({});
  const [vocabPools, setVocabPools] = useState<VocabularyPoolInfo[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string>('bundled-english');
  const [sampledCandidates, setSampledCandidates] = useState<string[]>([]);
  const [randomPoolError, setRandomPoolError] = useState<string | null>(null);
  const [isSampling, setIsSampling] = useState<boolean>(false);

  // Decode state
  const [decodeInput, setDecodeInput] = useState<string>('');
  const [allowBestEffortDecode, setAllowBestEffortDecode] = useState<boolean>(false);
  const [showDecodeKeySelector, setShowDecodeKeySelector] = useState<boolean>(false);
  const [showMatchedKeyDetails, setShowMatchedKeyDetails] = useState<boolean>(false);

  // Key Library management state
  const [keySearchQuery, setKeySearchQuery] = useState<string>('');
  const [keySortBy, setKeySortBy] = useState<'date_desc' | 'date_asc' | 'name' | 'mode'>('date_desc');
  const [keyFilterMode, setKeyFilterMode] = useState<'all' | 'unreferenced' | 'referenced'>('all');
  const [selectedKeyIdsForBulk, setSelectedKeyIdsForBulk] = useState<Set<string>>(new Set());
  const [inspectingKeyId, setInspectingKeyId] = useState<string | null>(null);
  const [renamingKeyId, setRenamingKeyId] = useState<string | null>(null);
  const [renameKeyDraft, setRenameKeyDraft] = useState<string>('');
  const [confirmDeleteKeyId, setConfirmDeleteKeyId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<boolean>(false);

  // Feedback banners
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const vocabInputRef = useRef<HTMLInputElement>(null);
  const cipherPackageInputRef = useRef<HTMLInputElement>(null);
  const cipherPackageModeRef = useRef<'import_only' | 'import_and_decode'>('import_and_decode');

  const basePoemTitle = useMemo(() => extractBasePoemTitle(poemTitle), [poemTitle]);

  // Compute next clean sequence number (#1, #2, ...) per mode for this poem's base title
  const nextSequenceByMode = useMemo(() => {
    const countForMode = (mode: CipherMode) => {
      const matching = dictionaries.filter(d => {
        const dMode = d.mode || 'manual';
        if (dMode !== mode) return false;
        const assocMatch = (d.associated_poem_titles || []).some(
          t => extractBasePoemTitle(t).toLowerCase() === basePoemTitle.toLowerCase()
        );
        const nameMatch =
          extractBasePoemTitle(d.name).toLowerCase() === basePoemTitle.toLowerCase();
        return assocMatch || nameMatch;
      });
      return matching.length + 1;
    };
    return {
      quick: countForMode('quick'),
      random: countForMode('random'),
      manual: countForMode('manual'),
    };
  }, [dictionaries, basePoemTitle]);

  // Parse cipher metadata from the currently open poem (if it is a saved ciphered poem)
  const currentPoemCipherMeta = useMemo(() => {
    if (!poemMetadataJson) return null;
    try {
      const parsed = JSON.parse(poemMetadataJson);
      return parsed?.cipher ?? null;
    } catch {
      return null;
    }
  }, [poemMetadataJson]);

  // Synchronize initial tab and stanza index on open
  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      if (initialStanzaIndex !== undefined && initialStanzaIndex >= 0) {
        setActiveStanzaIndex(Math.min(initialStanzaIndex, Math.max(0, poemStanzas.length - 1)));
      }
    }
  }, [isOpen, initialTab, initialStanzaIndex, poemStanzas.length]);

  // Hydrate all editing state together; reconciliation must retain uncertain mappings.
  useEffect(() => {
    if (currentPoemCipherMeta) {
      const next = currentPoemCipherMeta.scope === 'per_stanza' || Array.isArray(currentPoemCipherMeta.per_stanza_backup)
        ? reconcilePoemCipherMetadata(poemContent, currentPoemCipherMeta) : currentPoemCipherMeta;
      setCipherScope(next.scope ?? 'whole_poem');
      setSelectedDictId(next.key_id ?? next.dictionary_id ?? '');
      setStanzaEntries(next.stanzas ?? []);
      setUnresolvedStanzas(next.unresolved_stanzas ?? []);
      setWholePoemBackup(next.whole_poem_backup);
      setPerStanzaBackup(next.per_stanza_backup);
      if (next.mappings) setMappings(next.mappings);
    } else {
      setStanzaEntries(prev => {
        const result = reconcileStanzaEntries(poemStanzas, prev);
        if (result.unresolved.length) setUnresolvedStanzas(cur => [...cur,
          ...result.unresolved.filter(entry => !cur.some(old => old.id === entry.id))]);
        return result.reconciled;
      });
    }
  }, [currentPoemCipherMeta, poemContent, poemStanzas]);

  // Frequency analysis on current poem
  const wordFrequencies = useMemo(
    () => analyzeWordFrequency(poemContent),
    [poemContent]
  );

  const totalUniqueWords = wordFrequencies.length;
  const maxEvenSwappable = Math.floor(totalUniqueWords / 2) * 2;

  // Clamp Quick and Random counts when poem changes
  useEffect(() => {
    if (maxEvenSwappable > 0) {
      setQuickSwapCount(prev => {
        const clamped = Math.min(prev, maxEvenSwappable);
        const evened = Math.floor(clamped / 2) * 2;
        return evened > 0 ? evened : Math.min(2, maxEvenSwappable);
      });
    } else {
      setQuickSwapCount(0);
    }

    if (totalUniqueWords > 0) {
      setRandomTransformCount(prev =>
        Math.max(1, Math.min(prev, totalUniqueWords))
      );
    } else {
      setRandomTransformCount(0);
    }
  }, [maxEvenSwappable, totalUniqueWords]);

  // Short, non-nesting default key names when poem title or roll changes
  useEffect(() => {
    setQuickKeyName(formatDefaultCipherKeyName('quick', basePoemTitle, nextSequenceByMode.quick));
  }, [basePoemTitle, nextSequenceByMode.quick, quickRollIndex, quickSwapCount]);

  useEffect(() => {
    setRandomKeyName(formatDefaultCipherKeyName('random', basePoemTitle, nextSequenceByMode.random));
  }, [basePoemTitle, nextSequenceByMode.random, randomRollIndex, randomTransformCount]);

  // Deterministic Quick Cipher Result & Key (never silently rerolls on unrelated renders)
  const quickResult = useMemo(() => {
    try {
      const rng = createSeededRng(
        `quick:${poemId || basePoemTitle}:${poemContent.length}:${quickSwapCount}:roll-${quickRollIndex}`
      );
      const res = generateQuickCipher(poemContent, quickSwapCount, rng, {
        poemTitle: basePoemTitle,
        poemId,
        keyName:
          quickKeyName ||
          formatDefaultCipherKeyName('quick', basePoemTitle, nextSequenceByMode.quick),
        sequenceNumber: nextSequenceByMode.quick,
      });
      // Preserve committed key ID/state if this roll was already committed
      const committed = committedQuickKeys[quickRollIndex];
      if (committed && committed.word_count === res.mappings.length) {
        return {
          ...res,
          key: {
            ...committed,
            name: quickKeyName || committed.name,
          },
        };
      }
      return res;
    } catch {
      const fallback = createCipherKey({
        mode: 'quick',
        poemTitle: basePoemTitle,
        poemId,
        sourceText: poemContent,
        mappings: [],
        sequenceNumber: nextSequenceByMode.quick,
      });
      return {
        pairs: [] as Array<[string, string]>,
        mappings: [] as CipherMapping[],
        encodedText: poemContent,
        manifest: fallback.encodeResult.manifest,
        sourceFingerprint: fallback.encodeResult.sourceFingerprint,
        encodedFingerprint: fallback.encodeResult.encodedFingerprint,
        key: fallback.key,
        totalUnique: totalUniqueWords,
        maxSwappable: maxEvenSwappable,
        swapCount: 0,
      };
    }
  }, [
    poemContent,
    poemId,
    basePoemTitle,
    quickSwapCount,
    quickRollIndex,
    quickKeyName,
    nextSequenceByMode.quick,
    committedQuickKeys,
    totalUniqueWords,
    maxEvenSwappable,
  ]);

  // Fetch vocabulary sample when Random Cipher parameters change
  useEffect(() => {
    if (!isOpen || totalUniqueWords === 0 || randomTransformCount === 0) {
      setSampledCandidates([]);
      setRandomPoolError(null);
      return;
    }

    let cancelled = false;
    const fetchSample = async () => {
      setIsSampling(true);
      setRandomPoolError(null);
      try {
        const poemWords = wordFrequencies.map(f => f.word);
        const words = await api.getVocabularySample(
          selectedPoolId,
          Math.max(randomTransformCount * 2, randomTransformCount + 20),
          poemWords
        );
        if (!cancelled) {
          setSampledCandidates(words);
        }
      } catch (err: any) {
        if (!cancelled) {
          setSampledCandidates([]);
          setRandomPoolError(
            err?.message || 'Failed to sample words from vocabulary pool.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsSampling(false);
        }
      }
    };

    fetchSample();
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    selectedPoolId,
    randomTransformCount,
    randomRollIndex,
    totalUniqueWords,
    wordFrequencies,
  ]);

  // Deterministic Random Cipher Result & Key
  const randomResult = useMemo(() => {
    if (randomPoolError || sampledCandidates.length < randomTransformCount) {
      return null;
    }
    try {
      const rng = createSeededRng(
        `random:${poemId || basePoemTitle}:${selectedPoolId}:${randomTransformCount}:roll-${randomRollIndex}`
      );
      const res = generateRandomCipher(
        poemContent,
        randomTransformCount,
        sampledCandidates,
        rng,
        {
          poemTitle: basePoemTitle,
          poemId,
          keyName:
            randomKeyName ||
            formatDefaultCipherKeyName('random', basePoemTitle, nextSequenceByMode.random),
          vocabularyPoolId: selectedPoolId,
          sequenceNumber: nextSequenceByMode.random,
        }
      );
      const committed = committedRandomKeys[randomRollIndex];
      if (committed && committed.word_count === res.mappings.length) {
        return {
          ...res,
          key: {
            ...committed,
            name: randomKeyName || committed.name,
          },
        };
      }
      return res;
    } catch {
      return null;
    }
  }, [
    poemContent,
    poemId,
    basePoemTitle,
    randomTransformCount,
    sampledCandidates,
    randomPoolError,
    randomRollIndex,
    randomKeyName,
    nextSequenceByMode.random,
    selectedPoolId,
    committedRandomKeys,
  ]);

  // Manual Cipher Result & Key (Whole Poem Mode)
  const manualKeyAndResult = useMemo(() => {
    const existingDict = dictionaries.find(d => d.id === selectedDictId);
    return createCipherKey({
      id: existingDict ? existingDict.id : `key-manual-${Date.now()}`,
      name:
        dictName.trim() ||
        formatDefaultCipherKeyName('manual', basePoemTitle, nextSequenceByMode.manual),
      description: dictDescription.trim() || undefined,
      mode: 'manual',
      poemTitle: basePoemTitle,
      poemId,
      sourceText: poemContent,
      mappings,
      committed: Boolean(existingDict?.committed),
      sequenceNumber: nextSequenceByMode.manual,
    });
  }, [
    poemContent,
    basePoemTitle,
    poemId,
    mappings,
    selectedDictId,
    dictName,
    dictDescription,
    dictionaries,
    nextSequenceByMode.manual,
  ]);

  const manualEncodeResult = manualKeyAndResult.encodeResult;

  // Stanza-aware Encode Result (Per-Stanza Mode)
  const stanzaEncodeResult = useMemo(() => {
    return encodePoemWithStanzas(poemStanzas, stanzaEntries);
  }, [poemStanzas, stanzaEntries]);

  // Per-Stanza Cipher Key definition
  const perStanzaManualKey: CipherKey = useMemo(() => {
    const existingDict = dictionaries.find(d => d.id === selectedDictId);
    const flattenedMappings = stanzaEntries.flatMap(s => s.mappings).filter(m => m.original.trim());
    return {
      version: 2,
      algorithm_version: '2.0',
      id: existingDict ? existingDict.id : `key-manual-${Date.now()}`,
      name:
        dictName.trim() ||
        formatDefaultCipherKeyName('manual', basePoemTitle, nextSequenceByMode.manual),
      description: dictDescription.trim() || undefined,
      mode: 'manual',
      scope: 'per_stanza',
      poemTitle: basePoemTitle,
      poemId,
      source_fingerprint: stanzaEncodeResult.sourceFingerprint,
      encoded_fingerprint: stanzaEncodeResult.encodedFingerprint,
      manifest: stanzaEncodeResult.manifest,
      committed: Boolean(existingDict?.committed),
      word_count: flattenedMappings.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      mappings: flattenedMappings,
      stanzas: stanzaEntries.map((entry, index) => ({ ...entry,
        manifest: stanzaEncodeResult.stanzaResults[index]?.manifest,
        source_fingerprint: stanzaEncodeResult.stanzaResults[index]?.sourceFingerprint,
        encoded_fingerprint: stanzaEncodeResult.stanzaResults[index]?.encodedFingerprint })),
    };
  }, [
    selectedDictId,
    dictionaries,
    dictName,
    basePoemTitle,
    nextSequenceByMode.manual,
    dictDescription,
    poemId,
    stanzaEntries,
    stanzaEncodeResult,
  ]);

  // Effective Manual Key & Result based on active scope
  const effectiveManualKey = withCipherRecovery(
    cipherScope === 'per_stanza' ? perStanzaManualKey : { ...manualKeyAndResult.key, scope: 'whole_poem' },
    { recovery_version: 1, whole_poem_backup: wholePoemBackup, per_stanza_backup: perStanzaBackup,
      unresolved_stanzas: unresolvedStanzas, stanza_snapshot: computeTextFingerprint(poemContent) });
  const effectiveManualEncodeResult = cipherScope === 'per_stanza'
    ? {
        encodedText: stanzaEncodeResult.encodedText,
        manifest: stanzaEncodeResult.manifest,
        collisionReport: stanzaEncodeResult.collisionReport,
        sourceFingerprint: stanzaEncodeResult.sourceFingerprint,
        encodedFingerprint: stanzaEncodeResult.encodedFingerprint,
      }
    : manualEncodeResult;

  // Active stanza mappings and frequencies for Per-Stanza UI
  const safeActiveStanzaIndex = Math.min(Math.max(0, activeStanzaIndex), Math.max(0, poemStanzas.length - 1));
  const activeStanzaMappings = useMemo(() => {
    return stanzaEntries[safeActiveStanzaIndex]?.mappings ?? [];
  }, [stanzaEntries, safeActiveStanzaIndex]);

  const activeStanzaWordFrequencies = useMemo(() => {
    const text = poemStanzas[safeActiveStanzaIndex] || '';
    return analyzeWordFrequency(text);
  }, [poemStanzas, safeActiveStanzaIndex]);

  // Determine the Active Cipher Key for the current tab
  const activeKeyForCurrentMode: CipherKey | null = useMemo(() => {
    if (activeTab === 'quick') return quickResult.key;
    if (activeTab === 'random') return randomResult?.key ?? null;
    if (activeTab === 'manual') return effectiveManualKey;
    return dictionaries.find(d => d.id === selectedDecodeKeyId) ?? null;
  }, [activeTab, quickResult, randomResult, effectiveManualKey, dictionaries, selectedDecodeKeyId]);

  // All available keys for Decode (committed library keys + active temporary session key if not yet saved)
  const availableKeysForDecode = useMemo(() => {
    const map = new Map<string, CipherKey>();
    for (const d of dictionaries) {
      map.set(d.id, d);
    }
    if (quickResult.key.mappings.length > 0 && !map.has(quickResult.key.id)) {
      map.set(quickResult.key.id, quickResult.key);
    }
    if (randomResult && randomResult.key.mappings.length > 0 && !map.has(randomResult.key.id)) {
      map.set(randomResult.key.id, randomResult.key);
    }
    return Array.from(map.values());
  }, [dictionaries, quickResult, randomResult]);

  // Separate Poem-Specific Cipher Keys from Reusable Manual Dictionaries for clean selectors
  const groupedDecodeKeys = useMemo(() => {
    const poemKeys: CipherKey[] = [];
    const reusableDicts: CipherKey[] = [];
    for (const k of availableKeysForDecode) {
      if (classifyCipherKey(k) === 'poem_key') {
        poemKeys.push(k);
      } else {
        reusableDicts.push(k);
      }
    }
    return { poemKeys, reusableDicts };
  }, [availableKeysForDecode]);

  const selectedDecodeKey = useMemo(() => {
    return availableKeysForDecode.find(k => k.id === selectedDecodeKeyId) ?? null;
  }, [availableKeysForDecode, selectedDecodeKeyId]);

  // Resolve whether the currently selected Decode key is the poem's associated key
  const expectedPoemKeyId =
    currentPoemCipherMeta?.key_id || currentPoemCipherMeta?.dictionary_id;

  const isSelectedKeyPoemMatch = useMemo(() => {
    if (!selectedDecodeKey) return false;
    if (expectedPoemKeyId && selectedDecodeKey.id === expectedPoemKeyId) return true;
    const fp = computeTextFingerprint(decodeInput);
    if (selectedDecodeKey.encoded_fingerprint && selectedDecodeKey.encoded_fingerprint === fp) {
      return true;
    }
    return false;
  }, [selectedDecodeKey, expectedPoemKeyId, decodeInput]);

  // Mandatory Key Validation & Decoding Result
  const decodeResult = useMemo(() => {
    if (!selectedDecodeKey) {
      if (expectedPoemKeyId) {
        return {
          decodedText: decodeInput,
          fidelity: 'invalid_key' as const,
          mismatchReason: 'missing_metadata' as const,
          statusLabel: 'Missing Required Cipher Key',
          warnings: [],
          error: `Missing Cipher Key "${currentPoemCipherMeta?.dictionary_name || expectedPoemKeyId}". This key was deleted or is not in your library. Import its .mckey or .mccipher file to decode.`,
          keyId: expectedPoemKeyId,
          keyName: currentPoemCipherMeta?.dictionary_name || expectedPoemKeyId,
          sourceFingerprintMatched: false,
          encodedFingerprintMatched: false,
        };
      }
      return {
        decodedText: decodeInput,
        fidelity: 'invalid_key' as const,
        statusLabel: 'No Cipher Key Selected',
        warnings: [],
        error: 'Select or import a Cipher Key (.mckey) or Cipher Package (.mccipher) to decode.',
        keyId: '',
        keyName: '',
        sourceFingerprintMatched: false,
        encodedFingerprintMatched: false,
      };
    }

    return decodeWithCipherKey(decodeInput, selectedDecodeKey, {
      expectedKeyId: expectedPoemKeyId || undefined,
      isMatchedKey: isSelectedKeyPoemMatch,
      poemManifest: currentPoemCipherMeta?.manifest,
      allowBestEffortOnMismatch: allowBestEffortDecode,
    });
  }, [
    decodeInput,
    selectedDecodeKey,
    expectedPoemKeyId,
    isSelectedKeyPoemMatch,
    currentPoemCipherMeta,
    allowBestEffortDecode,
  ]);

  // Load dictionaries and vocabulary pools when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setDecodeInput(poemContent);
    setAllowBestEffortDecode(false);
    setShowDecodeKeySelector(false);
    setShowMatchedKeyDetails(false);
    setStatusMessage(null);
    setErrorMessage(null);

    if (initialTab) {
      setActiveTab(initialTab);
    } else if (currentPoemCipherMeta?.key_id || currentPoemCipherMeta?.dictionary_id) {
      setActiveTab('decode');
    } else {
      setActiveTab('quick');
    }

    loadDictionaries(true);
    loadVocabularyPools();
  }, [isOpen, poemId, poemContent, initialTab]);

  const showToast = (msg: string, isError = false) => {
    if (isError) {
      setErrorMessage(msg);
      setStatusMessage(null);
    } else {
      setStatusMessage(msg);
      setErrorMessage(null);
    }
    setTimeout(() => {
      setStatusMessage(prev => (prev === msg ? null : prev));
    }, 5000);
  };

  const loadDictionaries = async (autoMatchPoem = false) => {
    try {
      let list = await api.listCipherDictionaries();
      if (list.length === 0) {
        const now = new Date().toISOString();
        const starter: CipherKey = {
          version: 1,
          algorithm_version: '1.0',
          id: 'dict-botanical-default',
          name: 'Botanical Surrealism',
          description: 'Transforms emotions and architecture into botanical flora',
          mode: 'manual',
          committed: true,
          word_count: 5,
          created_at: now,
          updated_at: now,
          mappings: [
            { original: 'heart', replacement: 'rhizome' },
            { original: 'mind', replacement: 'mycelium' },
            { original: 'love', replacement: 'chlorophyll' },
            { original: 'stone', replacement: 'petrified wood' },
            { original: 'dark night', replacement: 'twilight canopy' },
          ],
        };
        await api.saveCipherDictionary(starter);
        list = await api.listCipherDictionaries();
      }
      setDictionaries(list);

      // Determine matching key for current poem if opening a ciphered poem
      const poemKeyId =
        currentPoemCipherMeta?.key_id || currentPoemCipherMeta?.dictionary_id;
      const poemFp = computeTextFingerprint(poemContent);
      const matchedByMeta = poemKeyId ? list.find(k => k.id === poemKeyId) : undefined;
      const matchedByFp = list.find(
        k => k.encoded_fingerprint && k.encoded_fingerprint === poemFp
      );
      const bestDecodeKey = matchedByMeta || matchedByFp;

      if (bestDecodeKey) {
        setSelectedDecodeKeyId(bestDecodeKey.id);
      } else if (poemKeyId && autoMatchPoem) {
        // Set to the expected poemKeyId so missing-key warning triggers clearly if deleted
        setSelectedDecodeKeyId(poemKeyId);
      } else if (!selectedDecodeKeyId && list.length > 0) {
        setSelectedDecodeKeyId(list[0].id);
      }

      if (!selectedDictId && bestDecodeKey && currentPoemCipherMeta) {
        setSelectedDictId(bestDecodeKey.id);
        setDictName(bestDecodeKey.name);
        if (!currentPoemCipherMeta.mappings) setMappings(bestDecodeKey.mappings);
      } else if (!selectedDictId && !currentPoemCipherMeta && list.length > 0) {
        const manualDefault = list.find(d => d.mode === 'manual') || list[0];
        selectManualDictionary(manualDefault);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to load Cipher Keys', true);
    }
  };

  const loadVocabularyPools = async () => {
    try {
      const pools = await api.listVocabularyPools();
      setVocabPools(pools);
      if (pools.length > 0 && !pools.some(p => p.id === selectedPoolId)) {
        setSelectedPoolId(pools[0].id);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to load vocabulary pools', true);
    }
  };

  const selectManualDictionary = (dict: CipherKey) => {
    setSelectedDictId(dict.id);
    setCipherScope(dict.scope ?? 'whole_poem');
    const fp = computeTextFingerprint(poemContent);
    const next: PoemCipherMetadata = dict.encoded_fingerprint === fp || dict.source_fingerprint === fp
      ? cipherMetadataFromKey(dict, poemContent) : { ...dict };
    // A reusable key is not evidence of identity in unrelated text.
    const reconciled = dict.scope === 'per_stanza'
      ? reconcilePoemCipherMetadata(poemContent, next) : next;
    setStanzaEntries(reconciled.stanzas ?? []);
    setWholePoemBackup(reconciled.whole_poem_backup);
    setPerStanzaBackup(reconciled.per_stanza_backup);
    setUnresolvedStanzas(reconciled.unresolved_stanzas ?? []);
    setDictName(dict.name);
    setDictDescription(dict.description || '');
    setMappings(
      dict.mappings.length > 0
        ? dict.mappings.map(m => ({ ...m }))
        : [{ original: '', replacement: '' }]
    );
  };

  const handleSelectDictChange = (id: string) => {
    if (id === '__new__') {
      setSelectedDictId(`key-manual-${Date.now()}`);
      setDictName(formatDefaultCipherKeyName('manual', basePoemTitle, nextSequenceByMode.manual));
      setDictDescription('');
      setMappings([{ original: '', replacement: '' }]);
      return;
    }
    const found = dictionaries.find(d => d.id === id);
    if (found) {
      selectManualDictionary(found);
    }
  };

  // Commit and save any CipherKey to the persistent library and select it for Decode
  const commitCipherKey = async (keyToCommit: CipherKey): Promise<CipherKey> => {
    const cleanMappings = keyToCommit.mappings.filter(
      m => m.original.trim().length > 0 && m.replacement.trim().length > 0
    );
    if (cleanMappings.length === 0) {
      throw new Error('Cannot commit an empty Cipher Key with zero mappings.');
    }

    const mode = keyToCommit.mode || 'quick';
    const seq = nextSequenceByMode[mode] ?? 1;
    const isPerStanza = keyToCommit.scope === 'per_stanza';
    const payload: CipherKey = {
      ...keyToCommit,
      version: isPerStanza ? 2 : (keyToCommit.version ?? 1),
      algorithm_version: isPerStanza ? '2.0' : (keyToCommit.algorithm_version ?? '1.0'),
      scope: keyToCommit.scope,
      stanzas: keyToCommit.stanzas,
      name:
        keyToCommit.name.trim() ||
        formatDefaultCipherKeyName(mode, basePoemTitle, seq),
      committed: true,
      word_count: cleanMappings.length,
      updated_at: new Date().toISOString(),
      mappings: cleanMappings,
    };

    const saved = await api.saveCipherDictionary(payload);
    const updatedList = await api.listCipherDictionaries();
    setDictionaries(updatedList);
    setSelectedDecodeKeyId(saved.id);

    if (saved.mode === 'quick') {
      setCommittedQuickKeys(prev => ({ ...prev, [quickRollIndex]: saved }));
    } else if (saved.mode === 'random') {
      setCommittedRandomKeys(prev => ({ ...prev, [randomRollIndex]: saved }));
    } else if (saved.mode === 'manual') {
      setSelectedDictId(saved.id);
    }

    return saved;
  };

  const handleExportCipherKey = async (keyToExport: CipherKey) => {
    try {
      // Ensure committed before exporting so the user always has a local copy too
      const committed =
        keyToExport.mappings.length > 0
          ? await commitCipherKey(keyToExport)
          : keyToExport;
      const jsonStr = JSON.stringify(committed, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      const safeName = sanitizePortableFilename(committed.name, 'cipher_key').toLowerCase();
      a.download = `${safeName}.mckey`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported "${committed.name}.mckey"`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to export .mckey file', true);
    }
  };

  // Export portable .mccipher package (bundles ciphered poem + exact CipherKey + fingerprints)
  const handleExportCipherPackage = async (
    keyToBundle: CipherKey,
    encodedTextToBundle: string
  ) => {
    try {
      const committedKey =
        keyToBundle.mappings.length > 0
          ? await commitCipherKey(keyToBundle)
          : keyToBundle;
      const pkg = createCipherPackage({
        poemTitle: basePoemTitle,
        encodedText: encodedTextToBundle,
        key: committedKey,
      });
      const jsonStr = JSON.stringify(pkg, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      const safeName = sanitizePortableFilename(
        `${basePoemTitle}_${committedKey.mode || 'cipher'}`,
        'cipher_package'
      ).toLowerCase();
      a.download = `${safeName}.mccipher`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(
        `Exported portable Cipher Package "${safeName}.mccipher" (Poem + Cipher Key)`
      );
    } catch (err: any) {
      showToast(err?.message || 'Failed to export .mccipher package', true);
    }
  };

  // Import portable .mccipher package (either Import Package or Import & Decode in one step)
  const handleImportCipherPackageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('Cipher Package exceeds maximum size limit (5 MB).', true);
      e.target.value = '';
      return;
    }

    const mode = cipherPackageModeRef.current;
    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const rawText = String(event.target?.result ?? '');
        const existingDocs = await api.listDocuments();
        const existingTitles = existingDocs.map(d => d.title);

        if (mode === 'import_and_decode') {
          const decodedPkg = decodeCipherPackage(rawText, { existingTitles });
          const savedKey = await api.saveCipherDictionary({
            ...decodedPkg.packageData.key,
            committed: true,
            updated_at: new Date().toISOString(),
          });
          const list = await api.listCipherDictionaries();
          setDictionaries(list);
          setSelectedDecodeKeyId(savedKey.id);
          setDecodeInput(decodedPkg.packageData.poem.encoded_text);
          setActiveTab('decode');

          const metaJson = JSON.stringify({
            poetic_form: decodedPkg.packageData.poem.poetic_form || 'Free Verse',
            cipher: {
              ...cipherMetadataFromKey(savedKey, decodedPkg.decodeResult.decodedText),
              mode: 'decoded',
              decoded_with_key_id: savedKey.id,
              decoded_with_key_name: savedKey.name,
              fidelity: decodedPkg.decodeResult.fidelity,
              source_fingerprint_verified:
                decodedPkg.decodeResult.sourceFingerprintMatched,
            },
          });

          if (onCreateNewPoem) {
            await onCreateNewPoem(
              decodedPkg.recoveredPoemTitle,
              decodedPkg.decodeResult.decodedText,
              metaJson,
              decodedPkg.packageData.poem.tags || ['cipher']
            );
          } else {
            await api.createDocument(
              'poetry',
              decodedPkg.recoveredPoemTitle,
              undefined,
              decodedPkg.decodeResult.decodedText,
              metaJson,
              decodedPkg.packageData.poem.tags || ['cipher']
            );
          }

          showToast(
            `Imported & decoded "${decodedPkg.recoveredPoemTitle}" with 100% fingerprint verification.`
          );
        } else {
          const pkg = validateCipherPackage(rawText);
          const savedKey = await api.saveCipherDictionary({
            ...pkg.key,
            committed: true,
            updated_at: new Date().toISOString(),
          });
          const list = await api.listCipherDictionaries();
          setDictionaries(list);
          setSelectedDecodeKeyId(savedKey.id);
          setDecodeInput(pkg.poem.encoded_text);

          const cipheredTitle = resolveUniquePoemTitle(
            formatCipheredPoemTitle(pkg.poem.title, savedKey.mode || 'quick'),
            existingTitles
          );
          const metaJson = JSON.stringify({
            poetic_form: pkg.poem.poetic_form || 'Free Verse',
            cipher: {
              ...cipherMetadataFromKey(savedKey, pkg.poem.encoded_text),
              mode: savedKey.mode || 'quick',
              key_id: savedKey.id,
              dictionary_id: savedKey.id,
              dictionary_name: savedKey.name,
              algorithm_version: pkg.algorithm_version,
              source_fingerprint: savedKey.source_fingerprint,
              encoded_fingerprint: savedKey.encoded_fingerprint,
              manifest: savedKey.manifest,
            },
          });

          if (onCreateNewPoem) {
            await onCreateNewPoem(
              cipheredTitle,
              pkg.poem.encoded_text,
              metaJson,
              pkg.poem.tags || ['cipher']
            );
          } else {
            await api.createDocument(
              'poetry',
              cipheredTitle,
              undefined,
              pkg.poem.encoded_text,
              metaJson,
              pkg.poem.tags || ['cipher']
            );
          }
          await loadDictionaries();
          setActiveTab('decode');
          showToast(
            `Imported Cipher Package: Saved poem "${cipheredTitle}" and key "${savedKey.name}".`
          );
        }
      } catch (err: any) {
        showToast(err?.message || 'Invalid Cipher Package (.mccipher) file', true);
      } finally {
        if (cipherPackageInputRef.current) {
          cipherPackageInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handleImportKeyFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast('Cipher Key file exceeds maximum size limit (10 MB).', true);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const raw = JSON.parse(String(event.target?.result || ''));
        const validated = validateCipherKey(raw, { disallowDuplicateOriginals: true });
        const importedKey: CipherKey = {
          ...validated,
          committed: true,
          updated_at: new Date().toISOString(),
        };
        const saved = await api.saveCipherDictionary(importedKey);
        const list = await api.listCipherDictionaries();
        setDictionaries(list);
        setSelectedDecodeKeyId(saved.id);
        setShowDecodeKeySelector(false);
        if (saved.mode === 'manual') {
          selectManualDictionary(saved);
        }
        showToast(`Imported Cipher Key "${saved.name}" (${saved.mappings.length} mappings)`);
      } catch (err: any) {
        showToast(err?.message || 'Invalid Cipher Key (.mckey) file', true);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleCopyKeyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      showToast(`Copied Key ID: ${id}`);
    } catch {
      showToast(`Key ID: ${id}`);
    }
  };

  const handleRenameKey = async (key: CipherKey, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      showToast('Key name cannot be empty.', true);
      return;
    }
    try {
      const updated: CipherKey = {
        ...key,
        name: trimmed,
        updated_at: new Date().toISOString(),
      };
      await api.saveCipherDictionary(updated);
      await loadDictionaries();
      setRenamingKeyId(null);
      showToast(`Renamed key to "${trimmed}"`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to rename Cipher Key', true);
    }
  };

  const handleDeleteKey = async (keyId: string, force = false) => {
    try {
      await api.deleteCipherDictionary(keyId, force);
      setConfirmDeleteKeyId(null);
      setSelectedKeyIdsForBulk(prev => {
        const next = new Set(prev);
        next.delete(keyId);
        return next;
      });
      const updated = await api.listCipherDictionaries();
      setDictionaries(updated);
      if (selectedDecodeKeyId === keyId) {
        setSelectedDecodeKeyId(updated[0]?.id || '');
      }
      if (selectedDictId === keyId && updated.length > 0) {
        selectManualDictionary(updated[0]);
      }
      showToast('Deleted Cipher Key.');
    } catch (err: any) {
      showToast(err?.message || 'Cannot delete referenced Cipher Key', true);
    }
  };

  const handleBulkDeleteSelectedKeys = async () => {
    const ids = Array.from(selectedKeyIdsForBulk);
    if (ids.length === 0) return;
    try {
      const report = await api.bulkDeleteCipherDictionaries(ids, false);
      setConfirmBulkDelete(false);
      setSelectedKeyIdsForBulk(new Set());
      const updated = await api.listCipherDictionaries();
      setDictionaries(updated);
      if (report.blocked.length > 0) {
        showToast(
          `Deleted ${report.deleted.length} key(s). Blocked ${report.blocked.length} referenced key(s) to protect saved poems.`,
          true
        );
      } else {
        showToast(`Deleted ${report.deleted.length} unreferenced Cipher Key(s).`);
      }
    } catch (err: any) {
      showToast(err?.message || 'Bulk delete failed', true);
    }
  };

  const handleImportVocabPool = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const content = String(event.target?.result || '');
        const poolName = file.name.replace(/\.txt$/i, '');
        const info = await api.importVocabularyPool(poolName, content);
        await loadVocabularyPools();
        setSelectedPoolId(info.id);
        showToast(`Imported vocabulary pool "${info.name}" (${info.word_count} words)`);
      } catch (err: any) {
        showToast(err?.message || 'Failed to import vocabulary file', true);
      } finally {
        if (vocabInputRef.current) vocabInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteVocabPool = async () => {
    if (selectedPoolId === 'bundled-english') return;
    try {
      await api.deleteVocabularyPool(selectedPoolId);
      await loadVocabularyPools();
      setSelectedPoolId('bundled-english');
      showToast('Deleted custom vocabulary pool');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete vocabulary pool', true);
    }
  };

  const handleMappingChange = (
    idx: number,
    field: 'original' | 'replacement',
    value: string
  ) => {
    if (cipherScope === 'per_stanza') {
      setStanzaEntries(prev => {
        const next = [...prev];
        const curIdx = Math.min(Math.max(0, activeStanzaIndex), next.length - 1);
        if (!next[curIdx]) return prev;
        const updated = [...next[curIdx].mappings];
        if (updated[idx]) {
          updated[idx] = { ...updated[idx], [field]: value };
        }
        next[curIdx] = {
          ...next[curIdx],
          mappings: updated,
        };
        return next;
      });
    } else {
      const updated = [...mappings];
      updated[idx] = { ...updated[idx], [field]: value };
      setMappings(updated);
    }
  };

  const handleAddMapping = (originalWord = '') => {
    if (cipherScope === 'per_stanza') {
      setStanzaEntries(prev => {
        const next = [...prev];
        const curIdx = Math.min(Math.max(0, activeStanzaIndex), next.length - 1);
        if (!next[curIdx]) return prev;
        const currentMappings = [...next[curIdx].mappings];
        if (originalWord) {
          const already = currentMappings.some(
            m => m.original.trim().toLowerCase() === originalWord.trim().toLowerCase()
          );
          if (already) return prev;
          if (
            currentMappings.length === 1 &&
            !currentMappings[0].original.trim() &&
            !currentMappings[0].replacement.trim()
          ) {
            next[curIdx] = {
              ...next[curIdx],
              mappings: [{ original: originalWord, replacement: '' }],
            };
            return next;
          }
        }
        next[curIdx] = {
          ...next[curIdx],
          mappings: [...currentMappings, { original: originalWord, replacement: '' }],
        };
        return next;
      });
    } else {
      if (originalWord) {
        const existingIdx = mappings.findIndex(
          m => m.original.trim().toLowerCase() === originalWord.toLowerCase()
        );
        if (existingIdx >= 0) return;
        if (
          mappings.length === 1 &&
          !mappings[0].original.trim() &&
          !mappings[0].replacement.trim()
        ) {
          setMappings([{ original: originalWord, replacement: '' }]);
          return;
        }
      }
      setMappings([...mappings, { original: originalWord, replacement: '' }]);
    }
  };

  const handleRemoveMapping = (idx: number) => {
    if (cipherScope === 'per_stanza') {
      setStanzaEntries(prev => {
        const next = [...prev];
        const curIdx = Math.min(Math.max(0, activeStanzaIndex), next.length - 1);
        if (!next[curIdx]) return prev;
        const updated = next[curIdx].mappings.filter((_, i) => i !== idx);
        next[curIdx] = {
          ...next[curIdx],
          mappings: updated.length > 0 ? updated : [{ original: '', replacement: '' }],
        };
        return next;
      });
    } else {
      if (mappings.length <= 1) {
        setMappings([{ original: '', replacement: '' }]);
        return;
      }
      setMappings(mappings.filter((_, i) => i !== idx));
    }
  };

  const handleCopyRulesToAllStanzas = () => {
    const curMappings = activeStanzaMappings.filter(m => m.original.trim());
    if (curMappings.length === 0) return;
    setStanzaEntries(prev =>
      prev.map(stz => ({
        ...stz,
        mappings: curMappings.map(m => ({ original: m.original, replacement: m.replacement })),
      }))
    );
    showToast(`Copied ${curMappings.length} rules to all ${stanzaEntries.length} stanzas.`);
  };

  const handleRevertStanza = () => {
    const curStz = stanzaEntries[activeStanzaIndex];
    if (!curStz) return;
    const backupEntry = perStanzaBackup?.find(s => s.id === curStz.id);
    if (backupEntry) {
      setStanzaEntries(prev => {
        const next = [...prev];
        next[activeStanzaIndex] = {
          ...next[activeStanzaIndex],
          mappings: backupEntry.mappings.map(m => ({ ...m })),
        };
        return next;
      });
      showToast(`Reverted Stanza ${activeStanzaIndex + 1} to saved backup state.`);
    } else {
      setStanzaEntries(prev => {
        const next = [...prev];
        next[activeStanzaIndex] = {
          ...next[activeStanzaIndex],
          mappings: [{ original: '', replacement: '' }],
        };
        return next;
      });
      showToast(`Cleared rules for Stanza ${activeStanzaIndex + 1}.`);
    }
  };

  const handleReassignUnresolvedToActive = () => {
    const target = cipherScope === 'per_stanza' ? stanzaEntries[activeStanzaIndex] : undefined;
    if (cipherScope === 'per_stanza' && !target) return;
    const result = reassignUnresolvedMappings(target?.mappings ?? mappings, unresolvedStanzas);
    if (target) {
      setStanzaEntries(prev => prev.map(entry => entry.id === target.id ? { ...entry, mappings: result.mappings } : entry));
    } else setMappings(result.mappings);
    setUnresolvedStanzas(result.unresolved);
    showToast(result.unresolved.length ? 'Non-conflicting rules reassigned. Conflicting rules remain in recovery.' : 'Recovered rules reassigned.');
  };

  const handleToggleScope = (targetScope: CipherScope) => {
    if (targetScope === cipherScope) return;
    if (targetScope === 'per_stanza') {
      const result = switchCipherScope(
        {
          scope: 'whole_poem',
          stanza_snapshot: currentPoemCipherMeta?.stanza_snapshot,
          unresolved_stanzas: unresolvedStanzas,
          mappings,
          stanzas: stanzaEntries,
          whole_poem_backup: wholePoemBackup,
          per_stanza_backup: perStanzaBackup,
        },
        'per_stanza',
        poemStanzas
      );
      setCipherScope('per_stanza');
      setUnresolvedStanzas(result.nextMeta.unresolved_stanzas ?? []);
      if (result.nextMeta.stanzas) {
        setStanzaEntries(result.nextMeta.stanzas);
      }
      if (result.nextMeta.whole_poem_backup) {
        setWholePoemBackup(result.nextMeta.whole_poem_backup);
      }
      showToast('Switched to Per-Stanza mode. Saved stanza rules restored when available; uncertain rules retained for recovery.');
    } else {
      // Switching to whole_poem
      const result = switchCipherScope(
        {
          scope: 'per_stanza',
          mappings,
          stanzas: stanzaEntries,
          whole_poem_backup: wholePoemBackup,
          per_stanza_backup: perStanzaBackup,
          unresolved_stanzas: unresolvedStanzas,
        },
        'whole_poem',
        poemStanzas
      );
      if (result.conflicts && result.conflicts.hasConflicts) {
        setConflictReport(result.conflicts);
        const initialChoices: Record<string, string> = {};
        for (const item of result.conflicts.conflictingWords) {
          if (item.replacements.length > 0) {
            initialChoices[item.original.toLowerCase()] = item.replacements[0].replacement;
          }
        }
        setConflictChoices(initialChoices);
        setIsConflictModalOpen(true);
      } else {
        const nextMappings = result.nextMeta.mappings ?? [];
        setMappings(nextMappings.length > 0 ? nextMappings : [{ original: '', replacement: '' }]);
        setCipherScope('whole_poem');
        if (result.nextMeta.per_stanza_backup) {
          setPerStanzaBackup(result.nextMeta.per_stanza_backup);
        }
        showToast('Switched to Whole Poem mode. Unified dictionary applied.');
      }
    }
  };

  const handleConfirmConflictSwitch = () => {
    const nextMeta = resolveScopeConflictsAndSwitch(
      {
        scope: 'per_stanza',
        mappings,
        stanzas: stanzaEntries,
        whole_poem_backup: wholePoemBackup,
        per_stanza_backup: perStanzaBackup,
        unresolved_stanzas: unresolvedStanzas,
      },
      conflictChoices,
      poemStanzas
    );
    const nextMappings = nextMeta.mappings ?? [];
    setMappings(nextMappings.length > 0 ? nextMappings : [{ original: '', replacement: '' }]);
    setCipherScope('whole_poem');
    if (nextMeta.per_stanza_backup) {
      setPerStanzaBackup(nextMeta.per_stanza_backup);
    }
    setIsConflictModalOpen(false);
    setConflictReport(null);
    showToast('Resolved conflicts and switched to Whole Poem mode.');
  };

  // Atomic save of Cipher Key + New Poem Document (non-nesting titles, never overwrites existing poems)
  const handleSaveAsNewPoem = async (mode: CipherMode | 'decoded') => {
    let desiredTitle = '';
    let targetContent = '';
    let cipherMeta: Record<string, unknown> = {};

    try {
      const existingDocs = await api.listDocuments();
      const existingTitles = existingDocs.map(d => d.title);

      if (mode === 'quick') {
        const committedKey = await commitCipherKey(quickResult.key);
        desiredTitle = formatCipheredPoemTitle(
          basePoemTitle,
          'quick',
          nextSequenceByMode.quick
        );
        targetContent = quickResult.encodedText;
        cipherMeta = {
          mode: 'quick',
          key_id: committedKey.id,
          dictionary_id: committedKey.id,
          dictionary_name: committedKey.name,
          algorithm_version: '1.0',
          swap_count: quickResult.swapCount,
          source_fingerprint: committedKey.source_fingerprint,
          encoded_fingerprint: committedKey.encoded_fingerprint,
          manifest: committedKey.manifest,
        };
      } else if (mode === 'random') {
        if (!randomResult) return;
        const committedKey = await commitCipherKey(randomResult.key);
        desiredTitle = formatCipheredPoemTitle(
          basePoemTitle,
          'random',
          nextSequenceByMode.random
        );
        targetContent = randomResult.encodedText;
        cipherMeta = {
          mode: 'random',
          key_id: committedKey.id,
          dictionary_id: committedKey.id,
          dictionary_name: committedKey.name,
          algorithm_version: '1.0',
          transform_count: randomResult.transformCount,
          pool_id: selectedPoolId,
          source_fingerprint: committedKey.source_fingerprint,
          encoded_fingerprint: committedKey.encoded_fingerprint,
          manifest: committedKey.manifest,
        };
      } else if (mode === 'manual') {
        const keyToCommit = effectiveManualKey;
        const encodeRes = cipherScope === 'per_stanza' ? stanzaEncodeResult : manualEncodeResult;
        const committedKey = await commitCipherKey(keyToCommit);
        desiredTitle = formatCipheredPoemTitle(
          basePoemTitle,
          'manual',
          nextSequenceByMode.manual
        );
        targetContent = encodeRes.encodedText;
        cipherMeta = { ...cipherMetadataFromKey(committedKey, targetContent) };
      } else {
        if (decodeResult.fidelity === 'mismatch' || decodeResult.fidelity === 'invalid_key') {
          showToast(
            decodeResult.error || 'Cannot save decoded poem with an invalid or mismatched key.',
            true
          );
          return;
        }
        desiredTitle = formatCipheredPoemTitle(basePoemTitle, 'decoded');
        targetContent = decodeResult.decodedText;
        cipherMeta = {
          ...(selectedDecodeKey ? cipherMetadataFromKey(selectedDecodeKey, targetContent) : {}),
          mode: 'decoded',
          decoded_with_key_id: decodeResult.keyId,
          decoded_with_key_name: decodeResult.keyName,
          fidelity: decodeResult.fidelity,
          source_fingerprint_verified: decodeResult.sourceFingerprintMatched,
        };
      }

      const targetTitle = resolveUniquePoemTitle(desiredTitle, existingTitles);
      const metaJson = JSON.stringify({
        poetic_form: 'Free Verse',
        cipher: cipherMeta,
      });

      if (onCreateNewPoem) {
        await onCreateNewPoem(targetTitle, targetContent, metaJson, ['cipher']);
      } else {
        await api.createDocument('poetry', targetTitle, undefined, targetContent, metaJson, [
          'cipher',
        ]);
      }
      await loadDictionaries();
      showToast(`Saved "${targetTitle}" and bound Cipher Key in library.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to save new poem with Cipher Key', true);
    }
  };

  // Filtered and sorted keys for the Key Library view
  const filteredLibraryKeys = useMemo(() => {
    const q = keySearchQuery.trim().toLowerCase();
    const filtered = dictionaries.filter(k => {
      const isReferenced =
        (k.associated_poem_ids?.length ?? 0) > 0 ||
        (k.associated_poem_titles?.length ?? 0) > 0;
      if (keyFilterMode === 'unreferenced' && isReferenced) return false;
      if (keyFilterMode === 'referenced' && !isReferenced) return false;
      if (!q) return true;
      return (
        k.name.toLowerCase().includes(q) ||
        k.id.toLowerCase().includes(q) ||
        (k.mode || '').toLowerCase().includes(q) ||
        (k.associated_poem_titles || []).some(t => t.toLowerCase().includes(q))
      );
    });

    return filtered.sort((a, b) => {
      if (keySortBy === 'date_desc') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (keySortBy === 'date_asc') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (keySortBy === 'mode') {
        return (a.mode || 'manual').localeCompare(b.mode || 'manual');
      }
      return a.name.localeCompare(b.name);
    });
  }, [dictionaries, keySearchQuery, keySortBy, keyFilterMode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-6xl h-[90vh] flex flex-col rounded-2xl border border-primary/40 bg-card text-foreground shadow-2xl overflow-hidden">
        {/* Hidden File Inputs for .mckey and .mccipher */}
        <input
          ref={cipherPackageInputRef}
          type="file"
          accept=".mccipher,.json"
          onChange={handleImportCipherPackageFile}
          className="hidden"
        />

        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/70 bg-muted/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/15 border border-primary/30 text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-bold tracking-wide text-foreground">
                The Emotional Cipher
              </h2>
              <p className="text-xs text-muted-foreground">
                {MCCIPHER_DISCLOSURE}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switcher */}
            <div className="flex items-center rounded-xl border border-border bg-background/60 p-1">
              <button
                onClick={() => setActiveTab('quick')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  activeTab === 'quick'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Shuffle className="w-3.5 h-3.5" />
                1. Quick Cipher
              </button>
              <button
                onClick={() => setActiveTab('random')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  activeTab === 'random'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Dices className="w-3.5 h-3.5" />
                2. Random Cipher
              </button>
              <button
                onClick={() => setActiveTab('manual')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  activeTab === 'manual'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Sliders className="w-3.5 h-3.5" />
                3. Manual Cipher
              </button>
              <button
                onClick={() => {
                  setDecodeInput(poemContent);
                  setActiveTab('decode');
                }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  activeTab === 'decode'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Decode Poem
              </button>
              <button
                onClick={() => setActiveTab('keys')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  activeTab === 'keys'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Key className="w-3.5 h-3.5" />
                Key Library ({dictionaries.length})
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              title="Close Emotional Cipher"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Compact Key Strip on Encode Tabs (Advanced key controls live in Key Library) */}
        {(activeTab === 'quick' || activeTab === 'random' || activeTab === 'manual') &&
          activeKeyForCurrentMode && (
            <div className="px-6 py-2 bg-primary/10 border-b border-primary/25 flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Key className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-xs font-semibold text-foreground truncate">
                  {truncateDisplayLabel(activeKeyForCurrentMode.name, 56)}
                </span>
                <span className="px-2 py-0.5 rounded bg-background/70 border border-border text-[11px] font-mono text-muted-foreground shrink-0">
                  {activeKeyForCurrentMode.mappings.length} mappings
                </span>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-medium shrink-0',
                    dictionaries.some(d => d.id === activeKeyForCurrentMode.id)
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  )}
                >
                  {dictionaries.some(d => d.id === activeKeyForCurrentMode.id)
                    ? 'Saved in Key Library'
                    : 'Preview Only (Saves with Poem)'}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setActiveTab('keys')}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Manage Keys in Library →
                </button>
              </div>
            </div>
          )}

        {/* Toast Notifications */}
        {(statusMessage || errorMessage) && (
          <div
            className={cn(
              'px-6 py-2.5 text-xs font-medium flex items-center justify-between border-b shrink-0',
              errorMessage
                ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
            )}
          >
            <div className="flex items-center gap-2">
              {errorMessage ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <Check className="w-4 h-4 shrink-0" />
              )}
              <span>{errorMessage || statusMessage}</span>
            </div>
            <button
              onClick={() => {
                setErrorMessage(null);
                setStatusMessage(null);
              }}
              className="text-xs underline opacity-75 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".mckey,.json,application/json"
          onChange={handleImportKeyFile}
          className="hidden"
        />
        <input
          ref={vocabInputRef}
          type="file"
          accept=".txt,text/plain"
          onChange={handleImportVocabPool}
          className="hidden"
        />

        {/* ===================================================================
            MODE 1: QUICK CIPHER (Existing-Word Bidirectional Swaps)
           =================================================================== */}
        {activeTab === 'quick' && (
          <div className="flex-1 grid grid-cols-12 overflow-hidden">
            {/* Left Column: Controls & Generated Swap Pairs (5 cols) */}
            <div className="col-span-5 border-r border-border/70 flex flex-col overflow-hidden bg-muted/5">
              <div className="p-5 border-b border-border/60 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Shuffle className="w-4 h-4 text-primary" />
                    <span>Quick Cipher — Existing-Word Swaps</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-mono">
                    {totalUniqueWords} unique words
                  </span>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Randomly pairs distinct words from your poem into non-overlapping bidirectional swaps (e.g.{' '}
                  <span className="text-foreground font-mono">love ↔ river</span>). Each roll generates a unique{' '}
                  <span className="text-primary font-semibold">.mckey</span> with exact manifest & fingerprint verification.
                </p>

                {maxEvenSwappable < 2 ? (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                    Your poem needs at least 2 unique words to perform an even swap.
                  </div>
                ) : (
                  <div className="space-y-3 bg-card/70 p-4 rounded-xl border border-border/80">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-foreground">
                        Participating Words (Even Count):
                      </label>
                      <span className="text-sm font-bold font-mono text-primary">
                        {quickSwapCount} words ({quickSwapCount / 2} pairs)
                      </span>
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={maxEvenSwappable}
                      step={2}
                      value={quickSwapCount}
                      onChange={e => {
                        const raw = parseInt(e.target.value, 10) || 0;
                        const clamped = Math.max(0, Math.min(maxEvenSwappable, raw));
                        setQuickSwapCount(Math.floor(clamped / 2) * 2);
                      }}
                      className="w-full accent-primary cursor-pointer"
                    />

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">Exact even count:</span>
                        <input
                          type="number"
                          min={0}
                          max={maxEvenSwappable}
                          step={2}
                          value={quickSwapCount}
                          onChange={e => {
                            const raw = parseInt(e.target.value, 10);
                            if (isNaN(raw)) return;
                            const clamped = Math.max(0, Math.min(maxEvenSwappable, raw));
                            setQuickSwapCount(Math.floor(clamped / 2) * 2);
                          }}
                          className="w-20 px-2 py-1 rounded-md bg-background border border-border text-xs font-mono text-foreground"
                        />
                        <span className="text-[11px] text-muted-foreground">
                          / {maxEvenSwappable} max
                        </span>
                      </div>

                      <button
                        onClick={() => setQuickRollIndex(prev => prev + 1)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/40 text-xs font-semibold text-primary hover:bg-primary/25 transition-colors"
                        title="Generate a fresh temporary Cipher Key without overwriting committed keys"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Randomize Again (Roll #{quickRollIndex})
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Generated Pairs List */}
              <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Bidirectional Swap Pairs ({quickResult.pairs.length})
                  </span>
                </div>

                {quickResult.pairs.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-6 text-center">
                    No words currently swapped (select an even number ≥ 2).
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {quickResult.pairs.map(([wordA, wordB], idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-3.5 py-2 rounded-xl border border-border/70 bg-card/80 text-xs font-mono"
                      >
                        <span className="text-foreground font-semibold">{wordA}</span>
                        <span className="text-primary px-2">↔</span>
                        <span className="text-primary font-semibold">{wordB}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Side-by-Side Preview (7 cols) */}
            <div className="col-span-7 flex flex-col overflow-hidden bg-background">
              <div className="px-5 py-3 border-b border-border/60 bg-emerald-500/10 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-xs text-emerald-300">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>100% Lossless Cipher Key Ready:</strong> Saving this poem automatically commits its matching Cipher Key (`.mckey`) and binds it to the poem.
                  </span>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-2 divide-x divide-border/60 overflow-hidden">
                <div className="flex flex-col overflow-hidden">
                  <div className="px-5 py-2.5 border-b border-border/50 bg-muted/10 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Original Poem (Untouched)
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 font-serif text-base leading-relaxed whitespace-pre-wrap text-foreground/85">
                    {poemContent || <span className="italic text-muted-foreground">Empty poem</span>}
                  </div>
                </div>

                <div className="flex flex-col overflow-hidden">
                  <div className="px-5 py-2.5 border-b border-border/50 bg-primary/5 text-xs font-semibold text-primary uppercase tracking-wider flex items-center justify-between">
                    <span>Quick Cipher Preview</span>
                    <span>{quickResult.swapCount} words swapped</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 font-serif text-base leading-relaxed whitespace-pre-wrap text-foreground">
                    {quickResult.encodedText || (
                      <span className="italic text-muted-foreground">Empty output</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-border/70 bg-muted/20 flex items-center justify-between shrink-0">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-primary shrink-0" />
                  <span>
                    Original poem is never overwritten. Saving commits the Cipher Key atomically.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      handleExportCipherPackage(quickResult.key, quickResult.encodedText)
                    }
                    disabled={quickResult.swapCount === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-primary/40 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-40 transition-all"
                    title="Export portable .mccipher package (bundles ciphered poem + exact Cipher Key for sharing)"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export `.mccipher`
                  </button>
                  <button
                    onClick={() => handleExportCipherKey(quickResult.key)}
                    disabled={quickResult.swapCount === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-xs font-semibold text-foreground hover:bg-muted/50 disabled:opacity-40 transition-all"
                    title="Export standalone .mckey file"
                  >
                    <Key className="w-3.5 h-3.5" />
                    Export `.mckey`
                  </button>
                  <button
                    onClick={() => handleSaveAsNewPoem('quick')}
                    disabled={quickResult.swapCount === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-all shadow-sm"
                  >
                    <FilePlus2 className="w-4 h-4" />
                    Save Ciphered Poem & Key
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            MODE 2: RANDOM CIPHER (Offline Vocabulary Substitution)
           =================================================================== */}
        {activeTab === 'random' && (
          <div className="flex-1 grid grid-cols-12 overflow-hidden">
            {/* Left Column: Vocabulary Pool & Controls (5 cols) */}
            <div className="col-span-5 border-r border-border/70 flex flex-col overflow-hidden bg-muted/5">
              <div className="p-5 border-b border-border/60 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Database className="w-4 h-4 text-primary" />
                    <span>Offline Vocabulary Pool</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => vocabInputRef.current?.click()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border bg-card text-xs text-muted-foreground hover:text-foreground transition-colors"
                      title="Import custom .txt word list (one word per line)"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Import .txt Pool
                    </button>
                    {selectedPoolId !== 'bundled-english' && (
                      <button
                        onClick={handleDeleteVocabPool}
                        className="p-1.5 rounded-md border border-border bg-card text-muted-foreground hover:text-rose-400 transition-colors"
                        title="Delete selected custom vocabulary pool"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <select
                  value={selectedPoolId}
                  onChange={e => setSelectedPoolId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                >
                  {vocabPools.map(pool => (
                    <option key={pool.id} value={pool.id}>
                      {pool.name} ({pool.word_count.toLocaleString()} words)
                    </option>
                  ))}
                </select>

                <div className="space-y-3 bg-card/70 p-4 rounded-xl border border-border/80">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground">
                      Words to Transform (Odd or Even):
                    </label>
                    <span className="text-sm font-bold font-mono text-primary">
                      {randomTransformCount} / {totalUniqueWords} words
                    </span>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={totalUniqueWords}
                    step={1}
                    value={randomTransformCount}
                    onChange={e =>
                      setRandomTransformCount(
                        Math.max(0, Math.min(totalUniqueWords, parseInt(e.target.value, 10) || 0))
                      )
                    }
                    className="w-full accent-primary cursor-pointer"
                  />

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">Count:</span>
                      <input
                        type="number"
                        min={0}
                        max={totalUniqueWords}
                        step={1}
                        value={randomTransformCount}
                        onChange={e => {
                          const raw = parseInt(e.target.value, 10);
                          if (isNaN(raw)) return;
                          setRandomTransformCount(Math.max(0, Math.min(totalUniqueWords, raw)));
                        }}
                        className="w-20 px-2 py-1 rounded-md bg-background border border-border text-xs font-mono text-foreground"
                      />
                    </div>

                    <button
                      onClick={() => setRandomRollIndex(prev => prev + 1)}
                      disabled={isSampling}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/40 text-xs font-semibold text-primary hover:bg-primary/25 transition-colors"
                    >
                      <RefreshCw className={cn('w-3.5 h-3.5', isSampling && 'animate-spin')} />
                      Reroll Vocabulary (Roll #{randomRollIndex})
                    </button>
                  </div>
                </div>

                {randomPoolError && (
                  <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{randomPoolError}</span>
                  </div>
                )}
              </div>

              {/* Generated Random Substitutions */}
              <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Generated Vocabulary Mappings ({randomResult?.pairs.length || 0})
                  </span>
                </div>

                {!randomResult || randomResult.pairs.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-6 text-center">
                    {randomPoolError
                      ? 'Resolve vocabulary pool count to generate mappings.'
                      : 'Select at least 1 word to transform.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {randomResult.pairs.map(([orig, repl], idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-3.5 py-2 rounded-xl border border-border/70 bg-card/80 text-xs font-mono"
                      >
                        <span className="text-foreground font-semibold">{orig}</span>
                        <span className="text-muted-foreground px-2">→</span>
                        <span className="text-primary font-semibold">{repl}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Side-by-Side Preview (7 cols) */}
            <div className="col-span-7 flex flex-col overflow-hidden bg-background">
              <div className="px-5 py-3 border-b border-border/60 bg-emerald-500/10 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-xs text-emerald-300">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>Collision-Free Vocabulary Substitution:</strong> Every replacement word is guaranteed absent from the original poem and bound to the active Cipher Key.
                  </span>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-2 divide-x divide-border/60 overflow-hidden">
                <div className="flex flex-col overflow-hidden">
                  <div className="px-5 py-2.5 border-b border-border/50 bg-muted/10 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Original Poem (Untouched)
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 font-serif text-base leading-relaxed whitespace-pre-wrap text-foreground/85">
                    {poemContent || <span className="italic text-muted-foreground">Empty poem</span>}
                  </div>
                </div>

                <div className="flex flex-col overflow-hidden">
                  <div className="px-5 py-2.5 border-b border-border/50 bg-primary/5 text-xs font-semibold text-primary uppercase tracking-wider flex items-center justify-between">
                    <span>Random Cipher Preview</span>
                    <span>{randomResult?.transformCount || 0} words substituted</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 font-serif text-base leading-relaxed whitespace-pre-wrap text-foreground">
                    {randomResult?.encodedText || (
                      <span className="italic text-muted-foreground">
                        {randomPoolError ? 'Insufficient vocabulary words' : 'Empty output'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-border/70 bg-muted/20 flex items-center justify-between shrink-0">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-primary shrink-0" />
                  <span>
                    Export `.mccipher` to share poem + key together, or Save Ciphered Poem & Key.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      randomResult &&
                      handleExportCipherPackage(randomResult.key, randomResult.encodedText)
                    }
                    disabled={!randomResult || randomResult.transformCount === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-primary/40 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-40 transition-all"
                    title="Export portable .mccipher package (bundles ciphered poem + exact Cipher Key)"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export `.mccipher`
                  </button>
                  <button
                    onClick={() => randomResult && handleExportCipherKey(randomResult.key)}
                    disabled={!randomResult || randomResult.transformCount === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-xs font-semibold text-foreground hover:bg-muted/50 disabled:opacity-40 transition-all"
                  >
                    <Key className="w-3.5 h-3.5" />
                    Export `.mckey`
                  </button>
                  <button
                    onClick={() => handleSaveAsNewPoem('random')}
                    disabled={!randomResult || randomResult.transformCount === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-all shadow-sm"
                  >
                    <FilePlus2 className="w-4 h-4" />
                    Save Ciphered Poem & Key
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            MODE 3: MANUAL CIPHER (Whole Poem vs Per-Stanza Mapping)
           =================================================================== */}
        {activeTab === 'manual' && (
          <div className="flex-1 grid grid-cols-12 overflow-hidden">
            {/* Left Column: Scope, Stanza Navigation & Rules (5 cols) */}
            <div className="col-span-5 border-r border-border/70 flex flex-col overflow-hidden bg-muted/5">
              {/* Scope Segmented Switch */}
              <div className="p-3 border-b border-border/60 bg-card/60 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-primary" />
                    Cipher Scope
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground/80">
                    {cipherScope === 'per_stanza' ? `${poemStanzas.length} Stanzas` : 'Whole Poem'}
                  </span>
                </div>
                <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border/70">
                  <button
                    type="button"
                    onClick={() => handleToggleScope('whole_poem')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-all',
                      cipherScope === 'whole_poem'
                        ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Whole Poem</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleScope('per_stanza')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-all',
                      cipherScope === 'per_stanza'
                        ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Per Stanza</span>
                  </button>
                </div>
              </div>

              {/* Per-Stanza Navigator & Toolbar */}
              {cipherScope === 'per_stanza' ? (
                <div className="p-3 border-b border-border/60 space-y-2.5 bg-background/50">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="font-semibold uppercase tracking-wider">Select Stanza</span>
                      <span>Active: Stanza {safeActiveStanzaIndex + 1} of {poemStanzas.length}</span>
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {poemStanzas.map((stzText, sIdx) => {
                        const lineCount = stzText.split('\n').filter(Boolean).length || 1;
                        const rulesCount =
                          stanzaEntries[sIdx]?.mappings?.filter(m => m.original.trim()).length || 0;
                        const isActive = safeActiveStanzaIndex === sIdx;
                        return (
                          <button
                            key={stanzaEntries[sIdx]?.id || sIdx}
                            type="button"
                            onClick={() => setActiveStanzaIndex(sIdx)}
                            className={cn(
                              'px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0',
                              isActive
                                ? 'bg-primary/20 border-primary text-primary font-semibold shadow-sm'
                                : 'bg-card border-border/70 text-foreground hover:border-primary/40'
                            )}
                          >
                            <span>Stanza {sIdx + 1}</span>
                            <span className="text-[10px] opacity-70">({lineCount}L)</span>
                            {rulesCount > 0 && (
                              <span className="px-1.5 py-0.2 rounded-full bg-primary/25 text-[10px] font-mono text-primary font-bold">
                                {rulesCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
                    <span className="text-[11px] text-muted-foreground">
                      Stanza {safeActiveStanzaIndex + 1} Rules
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopyRulesToAllStanzas}
                        disabled={activeStanzaMappings.filter(m => m.original.trim()).length === 0}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border border-border bg-card hover:bg-muted/50 text-foreground disabled:opacity-40 transition-colors"
                        title="Copy active stanza substitution rules to all other stanzas"
                      >
                        <Copy className="w-3 h-3" />
                        Copy to All
                      </button>
                      <button
                        type="button"
                        onClick={handleRevertStanza}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border border-border bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                        title="Revert active stanza rules"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Revert
                      </button>
                    </div>
                  </div>

                  {unresolvedStanzas.length > 0 && (
                    <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {unresolvedStanzas.length} detached stanza(s) contain rules.
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleReassignUnresolvedToActive}
                          className="text-[11px] underline font-medium hover:text-amber-200"
                        >
                          Reassign
                        </button>
                        <button
                          type="button"
                          onClick={() => setUnresolvedStanzas([])}
                          className="text-[11px] opacity-70 hover:opacity-100"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={dictName}
                      onChange={e => setDictName(e.target.value)}
                      placeholder="Cipher Key Name"
                      className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                    <input
                      type="text"
                      value={dictDescription}
                      onChange={e => setDictDescription(e.target.value)}
                      placeholder="Optional description..."
                      className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 border-b border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-primary" />
                      Reusable Dictionary / Manual Key
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        title="Import Cipher Key (.mckey or .json)"
                      >
                        <Upload className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleExportCipherKey(effectiveManualKey)}
                        className="p-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        title="Export Cipher Key (.mckey)"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <select
                    value={
                      dictionaries.some(d => d.id === selectedDictId) ? selectedDictId : '__new__'
                    }
                    onChange={e => handleSelectDictChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                  >
                    {dictionaries.filter(d => classifyCipherKey(d) === 'reusable_dictionary').length > 0 && (
                      <optgroup label="Reusable Manual Dictionaries">
                        {dictionaries
                          .filter(d => classifyCipherKey(d) === 'reusable_dictionary')
                          .map(d => (
                            <option key={d.id} value={d.id}>
                              {truncateDisplayLabel(d.name, 45)} ({d.mappings.length} rules)
                            </option>
                          ))}
                      </optgroup>
                    )}
                    {dictionaries.filter(d => classifyCipherKey(d) === 'poem_key').length > 0 && (
                      <optgroup label="Poem-Specific Cipher Keys">
                        {dictionaries
                          .filter(d => classifyCipherKey(d) === 'poem_key')
                          .map(d => (
                            <option key={d.id} value={d.id}>
                              [{d.mode?.toUpperCase() || 'KEY'}] {truncateDisplayLabel(d.name, 42)} ({d.mappings.length} rules)
                            </option>
                          ))}
                      </optgroup>
                    )}
                    <option value="__new__">+ Create New Manual Dictionary / Key...</option>
                  </select>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={dictName}
                      onChange={e => setDictName(e.target.value)}
                      placeholder="Dictionary / Key Name"
                      className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                    <input
                      type="text"
                      value={dictDescription}
                      onChange={e => setDictDescription(e.target.value)}
                      placeholder="Optional description..."
                      className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              )}

              {/* Word Frequency Chips */}
              <div className="p-4 border-b border-border/60 max-h-40 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {cipherScope === 'per_stanza'
                      ? `Stanza ${safeActiveStanzaIndex + 1} Words (Click to Map)`
                      : 'Poem Word Frequency (Click to Map)'}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {cipherScope === 'per_stanza'
                      ? `${activeStanzaWordFrequencies.length} words`
                      : `${wordFrequencies.length} unique words`}
                  </span>
                </div>
                {(cipherScope === 'per_stanza' ? activeStanzaWordFrequencies : wordFrequencies).length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Write some verses in this {cipherScope === 'per_stanza' ? 'stanza' : 'poem'} first to analyze word frequency.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(cipherScope === 'per_stanza' ? activeStanzaWordFrequencies : wordFrequencies).map(freq => {
                      const curList = cipherScope === 'per_stanza' ? activeStanzaMappings : mappings;
                      const isMapped = curList.some(
                        m => m.original.trim().toLowerCase() === freq.word
                      );
                      return (
                        <button
                          key={freq.word}
                          onClick={() => handleAddMapping(freq.word)}
                          className={cn(
                            'px-2 py-0.5 rounded-md text-xs border transition-colors flex items-center gap-1',
                            isMapped
                              ? 'bg-primary/20 border-primary/50 text-primary font-medium'
                              : 'bg-background border-border/70 text-foreground hover:border-primary/40'
                          )}
                        >
                          <span>{freq.word}</span>
                          <span className="text-[10px] opacity-60 font-mono">×{freq.count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Mapping Rules Table */}
              <div className="flex-1 flex flex-col overflow-hidden p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {cipherScope === 'per_stanza'
                      ? `Stanza ${safeActiveStanzaIndex + 1} Rules`
                      : 'Substitution Rules (Longest Phrase Wins)'}
                  </span>
                  <button
                    onClick={() => handleAddMapping('')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {cipherScope === 'per_stanza' ? 'Add Rule to Stanza' : 'Add Rule'}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {(cipherScope === 'per_stanza' ? activeStanzaMappings : mappings).map((m, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={m.original}
                        onChange={e => handleMappingChange(idx, 'original', e.target.value)}
                        placeholder="Original word or phrase..."
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                      />
                      <span className="text-muted-foreground text-xs">→</span>
                      <input
                        type="text"
                        value={m.replacement}
                        onChange={e => handleMappingChange(idx, 'replacement', e.target.value)}
                        placeholder="Replacement..."
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                      />
                      <button
                        onClick={() => handleRemoveMapping(idx)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-rose-400 transition-colors"
                        title="Remove rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Live Side-by-Side Preview & Collision Warnings (7 cols) */}
            <div className="col-span-7 flex flex-col overflow-hidden bg-background">
              {effectiveManualEncodeResult.collisionReport.hasCollisions && (
                <div className="px-5 py-3 bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-xs space-y-1 shrink-0">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Ambiguity & Collision Notice (Manifest Required for Exact Reversal)</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] opacity-90">
                    {effectiveManualEncodeResult.collisionReport.warnings.slice(0, 3).map((w: string, i: number) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex-1 grid grid-cols-2 divide-x divide-border/60 overflow-hidden">
                <div className="flex flex-col overflow-hidden">
                  <div className="px-5 py-2.5 border-b border-border/50 bg-muted/10 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                    <span>
                      {previewMode === 'active_stanza' && cipherScope === 'per_stanza'
                        ? `Original Stanza ${safeActiveStanzaIndex + 1}`
                        : 'Original Poem (Untouched)'}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 font-serif text-base leading-relaxed whitespace-pre-wrap text-foreground/85">
                    {previewMode === 'active_stanza' && cipherScope === 'per_stanza'
                      ? poemStanzas[safeActiveStanzaIndex] || <span className="italic text-muted-foreground">Empty stanza</span>
                      : poemContent || <span className="italic text-muted-foreground">Empty poem</span>}
                  </div>
                </div>

                <div className="flex flex-col overflow-hidden">
                  <div className="px-5 py-2.5 border-b border-border/50 bg-primary/5 text-xs font-semibold text-primary uppercase tracking-wider flex items-center justify-between">
                    <span>Transformed Preview</span>
                    <div className="flex items-center gap-2">
                      {cipherScope === 'per_stanza' && (
                        <div className="flex items-center rounded-md border border-border/70 overflow-hidden text-[10px]">
                          <button
                            type="button"
                            onClick={() => setPreviewMode('full_poem')}
                            className={cn(
                              'px-2 py-0.5 font-sans transition-colors',
                              previewMode === 'full_poem'
                                ? 'bg-primary text-primary-foreground font-semibold'
                                : 'bg-background text-muted-foreground hover:text-foreground'
                            )}
                          >
                            Full Poem
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewMode('active_stanza')}
                            className={cn(
                              'px-2 py-0.5 font-sans transition-colors',
                              previewMode === 'active_stanza'
                                ? 'bg-primary text-primary-foreground font-semibold'
                                : 'bg-background text-muted-foreground hover:text-foreground'
                            )}
                          >
                            Stanza {safeActiveStanzaIndex + 1}
                          </button>
                        </div>
                      )}
                      <span>
                        {previewMode === 'active_stanza' && cipherScope === 'per_stanza'
                          ? `${activeStanzaMappings.filter(m => m.original.trim()).length} rules`
                          : `${effectiveManualEncodeResult.manifest.substitutions.length} substitutions`}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 font-serif text-base leading-relaxed whitespace-pre-wrap text-foreground">
                    {previewMode === 'active_stanza' && cipherScope === 'per_stanza' ? (
                      stanzaEncodeResult.encodedStanzas[safeActiveStanzaIndex] || (
                        <span className="italic text-muted-foreground">Empty output</span>
                      )
                    ) : (
                      effectiveManualEncodeResult.encodedText || (
                        <span className="italic text-muted-foreground">Empty output</span>
                      )
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-border/70 bg-muted/20 flex items-center justify-between shrink-0">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-primary shrink-0" />
                  <span>
                    Saving creates a new poem and commits the Cipher Key (with manifest & fingerprints) to your Key Library.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      handleExportCipherPackage(
                        effectiveManualKey,
                        effectiveManualEncodeResult.encodedText
                      )
                    }
                    disabled={
                      cipherScope === 'per_stanza'
                        ? !stanzaEntries.some(s => s.mappings.some(m => m.original.trim()))
                        : manualEncodeResult.manifest.substitutions.length === 0
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-primary/40 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-40 transition-all"
                    title="Export portable .mccipher package (bundles ciphered poem + exact Cipher Key)"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export `.mccipher`
                  </button>
                  <button
                    onClick={() => handleExportCipherKey(effectiveManualKey)}
                    disabled={
                      cipherScope === 'per_stanza'
                        ? !stanzaEntries.some(s => s.mappings.some(m => m.original.trim()))
                        : manualEncodeResult.manifest.substitutions.length === 0
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-xs font-semibold text-foreground hover:bg-muted/50 disabled:opacity-40 transition-all"
                  >
                    <Key className="w-3.5 h-3.5" />
                    Export `.mckey`
                  </button>
                  <button
                    onClick={() => handleSaveAsNewPoem('manual')}
                    disabled={
                      cipherScope === 'per_stanza'
                        ? !stanzaEntries.some(s => s.mappings.some(m => m.original.trim()))
                        : manualEncodeResult.manifest.substitutions.length === 0
                    }
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-all shadow-sm"
                  >
                    <FilePlus2 className="w-4 h-4" />
                    Save Ciphered Poem & Key
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            DECODE POEM VIEW (Compact Matched Key Card + .mccipher Sharing)
           =================================================================== */}
        {activeTab === 'decode' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Compact Matched Key Summary Card & Secondary Actions */}
            <div className="px-6 py-3.5 border-b border-border/60 bg-muted/10 space-y-2.5 shrink-0">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                {/* Matched Key Card (or No Key Banner) */}
                {selectedDecodeKey ? (
                  <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl border border-primary/35 bg-card/90 shadow-sm min-w-0">
                    <div className="p-1.5 rounded-lg bg-primary/15 text-primary shrink-0">
                      <Key className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-xs font-semibold text-foreground truncate"
                          title={selectedDecodeKey.name}
                        >
                          {truncateDisplayLabel(selectedDecodeKey.name, 48)}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-primary/15 border border-primary/30 text-[10px] font-mono uppercase text-primary font-semibold">
                          {selectedDecodeKey.mode || 'manual'}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {selectedDecodeKey.mappings.length} rules
                        </span>
                        {isSelectedKeyPoemMatch && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300">
                            ★ Matched Poem Key
                          </span>
                        )}
                      </div>
                      {showMatchedKeyDetails && (
                        <div className="mt-1.5 pt-1.5 border-t border-border/50 text-[11px] font-mono text-muted-foreground flex items-center gap-4 flex-wrap">
                          <span>ID: {selectedDecodeKey.id}</span>
                          <span>
                            Created: {selectedDecodeKey.created_at.slice(0, 16).replace('T', ' ')}
                          </span>
                          <span>
                            Type:{' '}
                            {classifyCipherKey(selectedDecodeKey) === 'poem_key'
                              ? 'Poem Cipher Key'
                              : 'Reusable Dictionary'}
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setShowMatchedKeyDetails(prev => !prev)}
                      className="px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground border border-border/60 bg-background/60 shrink-0"
                    >
                      {showMatchedKeyDetails ? 'Hide Info' : 'Details'}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      No matching Cipher Key selected. Choose a key or import a `.mckey` / `.mccipher` file.
                    </span>
                  </div>
                )}

                {/* Secondary Actions & Decode Fidelity Badge */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setShowDecodeKeySelector(prev => !prev)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                      showDecodeKeySelector
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-border bg-card text-foreground hover:bg-muted/60'
                    )}
                  >
                    <Key className="w-3.5 h-3.5" />
                    {showDecodeKeySelector ? 'Hide Key Selector' : 'Choose Different Key'}
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted/60 transition-colors"
                    title="Import a standalone .mckey file"
                  >
                    <Upload className="w-3.5 h-3.5 text-primary" />
                    Import Key (`.mckey`)
                  </button>

                  <button
                    onClick={() => {
                      cipherPackageModeRef.current = 'import_and_decode';
                      cipherPackageInputRef.current?.click();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/15 text-xs font-semibold text-primary hover:bg-primary/25 transition-colors"
                    title="Import a portable .mccipher package and immediately decode & recover the original poem in one step"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Import & Decode (`.mccipher`)
                  </button>

                  {/* Decode Fidelity Status Badge */}
                  <span
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5',
                      decodeResult.fidelity === 'lossless'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : decodeResult.fidelity === 'ambiguous'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    )}
                  >
                    {decodeResult.fidelity === 'lossless' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    )}
                    {decodeResult.statusLabel}
                  </span>
                </div>
              </div>

              {/* On-Demand "Choose Different Key" Selector Drawer (Truncated & Grouped) */}
              {(showDecodeKeySelector || !selectedDecodeKey) && (
                <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5 flex-wrap flex-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Select Key:
                    </span>
                    <select
                      value={selectedDecodeKeyId}
                      onChange={e => {
                        setSelectedDecodeKeyId(e.target.value);
                        setAllowBestEffortDecode(false);
                        setShowDecodeKeySelector(false);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary min-w-[300px] max-w-md"
                    >
                      <option value="">-- Select Cipher Key or Dictionary --</option>
                      {groupedDecodeKeys.poemKeys.length > 0 && (
                        <optgroup label="Poem Cipher Keys">
                          {groupedDecodeKeys.poemKeys.map(k => {
                            const isMatch =
                              (expectedPoemKeyId && expectedPoemKeyId === k.id) ||
                              (k.encoded_fingerprint &&
                                k.encoded_fingerprint === computeTextFingerprint(decodeInput));
                            return (
                              <option key={k.id} value={k.id}>
                                {isMatch ? '★ [Matched] ' : ''}
                                {truncateDisplayLabel(k.name, 46)} ({k.mappings.length} rules)
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                      {groupedDecodeKeys.reusableDicts.length > 0 && (
                        <optgroup label="Reusable Manual Dictionaries">
                          {groupedDecodeKeys.reusableDicts.map(k => (
                            <option key={k.id} value={k.id}>
                              {truncateDisplayLabel(k.name, 46)} ({k.mappings.length} rules)
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>

                    <button
                      onClick={() => {
                        cipherPackageModeRef.current = 'import_only';
                        cipherPackageInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-card text-xs text-muted-foreground hover:text-foreground transition-colors"
                      title="Import a .mccipher package into your notebook as a ciphered poem and key"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Import Cipher Package (`.mccipher`)
                    </button>

                    <button
                      onClick={() => setDecodeInput(poemContent)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-card text-xs text-muted-foreground hover:text-foreground transition-colors"
                      title="Reset input to current poem text"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Reset Text
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Diagnostic Key Mismatch or Invalid Key Banner */}
            {(decodeResult.fidelity === 'mismatch' || decodeResult.fidelity === 'invalid_key') &&
              decodeResult.error && (
                <div className="px-6 py-3 bg-rose-500/15 border-b border-rose-500/30 text-rose-200 text-xs flex items-center justify-between gap-4 shrink-0">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                    <div className="space-y-0.5">
                      <div className="font-bold">
                        {decodeResult.mismatchReason === 'text_modified'
                          ? 'Ciphered Text Modified Since Encoding'
                          : decodeResult.mismatchReason === 'wrong_key'
                          ? 'Wrong Cipher Key Selected'
                          : 'Missing or Incompatible Cipher Key'}
                      </div>
                      <div className="opacity-95">
                        {decodeResult.error}
                        {decodeResult.mismatchReason === 'wrong_key' &&
                          currentPoemCipherMeta?.dictionary_name && (
                            <span className="ml-2">
                              (Expected Key:{' '}
                              <strong>
                                {truncateDisplayLabel(currentPoemCipherMeta.dictionary_name, 48)}
                              </strong>
                              )
                            </span>
                          )}
                      </div>
                    </div>
                  </div>
                  {decodeResult.fidelity === 'mismatch' && selectedDecodeKey && (
                    <button
                      onClick={() => setAllowBestEffortDecode(true)}
                      className="px-3 py-1 rounded-lg border border-rose-400/40 bg-rose-500/20 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/30 shrink-0"
                    >
                      Force Best-Effort Reversal Anyway
                    </button>
                  )}
                </div>
              )}

            {/* Ambiguity Warnings Banner */}
            {decodeResult.warnings.length > 0 && (
              <div className="px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-xs shrink-0">
                {decodeResult.warnings.map((w, i) => (
                  <div key={i}>• {w}</div>
                ))}
              </div>
            )}

            <div className="flex-1 grid grid-cols-2 divide-x divide-border/60 overflow-hidden">
              <div className="flex flex-col overflow-hidden">
                <div className="px-5 py-2.5 border-b border-border/50 bg-muted/10 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                  <span>Ciphered Input Text (Paste or Edit)</span>
                  <span className="font-mono text-[10px]">
                    FP: {computeTextFingerprint(decodeInput).slice(0, 20)}...
                  </span>
                </div>
                <textarea
                  value={decodeInput}
                  onChange={e => setDecodeInput(e.target.value)}
                  placeholder="Paste ciphered poem text here..."
                  className="flex-1 w-full p-6 bg-transparent resize-none focus:outline-none font-serif text-base leading-relaxed text-foreground"
                />
              </div>

              <div className="flex flex-col overflow-hidden">
                <div className="px-5 py-2.5 border-b border-border/50 bg-primary/5 text-xs font-semibold text-primary uppercase tracking-wider flex items-center justify-between">
                  <span>Decoded Original Output</span>
                  {decodeResult.sourceFingerprintMatched && (
                    <span className="text-[11px] text-emerald-400 font-mono">
                      ✓ Original Fingerprint Verified
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-6 font-serif text-base leading-relaxed whitespace-pre-wrap text-foreground">
                  {decodeResult.fidelity === 'mismatch' || decodeResult.fidelity === 'invalid_key' ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground space-y-2.5">
                      <ShieldAlert className="w-8 h-8 text-rose-400/80" />
                      <p className="text-sm font-semibold text-foreground">
                        {decodeResult.mismatchReason === 'text_modified'
                          ? 'The ciphered poem text was edited after encoding.'
                          : decodeResult.mismatchReason === 'wrong_key'
                          ? 'The selected Cipher Key does not match this poem.'
                          : decodeResult.error}
                      </p>
                      <p className="text-xs max-w-md leading-relaxed">
                        {decodeResult.mismatchReason === 'text_modified'
                          ? 'Because exact span positions or words were changed after encoding, deterministic fingerprint verification stopped. Click "Force Best-Effort Reversal Anyway" above to reverse words heuristically.'
                          : 'Click "Choose Different Key" above to pick the matching key for this poem, or import a .mckey / .mccipher file.'}
                      </p>
                    </div>
                  ) : (
                    decodeResult.decodedText || (
                      <span className="italic text-muted-foreground">No text to decode</span>
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border/70 bg-muted/20 flex items-center justify-between shrink-0">
              <div className="text-xs text-muted-foreground">
                Decoding uses deterministic key validation and never overwrites the ciphered poem.
              </div>
              <div className="flex items-center gap-2">
                {selectedDecodeKey && decodeResult.fidelity === 'lossless' && (
                  <button
                    onClick={() => handleExportCipherPackage(selectedDecodeKey, decodeInput)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-primary/40 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/20 transition-all"
                    title="Export portable .mccipher package (bundles this ciphered poem + its Cipher Key)"
                  >
                    <Download className="w-4 h-4" />
                    Export Cipher Package (`.mccipher`)
                  </button>
                )}
                <button
                  onClick={() => handleSaveAsNewPoem('decoded')}
                  disabled={
                    !decodeInput.trim() ||
                    decodeResult.fidelity === 'mismatch' ||
                    decodeResult.fidelity === 'invalid_key'
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-all shadow-sm"
                >
                  <FilePlus2 className="w-4 h-4" />
                  Save Decoded Poem as New Document
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            KEY LIBRARY VIEW (Manage, Search, Sort, Inspect, Import/Export, Bulk Delete)
           =================================================================== */}
        {activeTab === 'keys' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-background">
            {/* Key Library Toolbar */}
            <div className="px-6 py-4 border-b border-border/70 bg-muted/10 flex items-center justify-between gap-4 flex-wrap shrink-0">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={keySearchQuery}
                    onChange={e => setKeySearchQuery(e.target.value)}
                    placeholder="Search by key name, ID, or poem..."
                    className="pl-8 pr-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary w-64"
                  />
                </div>

                <select
                  value={keyFilterMode}
                  onChange={e => setKeyFilterMode(e.target.value as any)}
                  className="px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground"
                >
                  <option value="all">All Keys ({dictionaries.length})</option>
                  <option value="unreferenced">
                    Unreferenced / Test Keys Only (
                    {
                      dictionaries.filter(
                        k => (k.associated_poem_titles?.length ?? 0) === 0
                      ).length
                    }
                    )
                  </option>
                  <option value="referenced">
                    Referenced by Saved Poems (
                    {
                      dictionaries.filter(
                        k => (k.associated_poem_titles?.length ?? 0) > 0
                      ).length
                    }
                    )
                  </option>
                </select>

                <select
                  value={keySortBy}
                  onChange={e => setKeySortBy(e.target.value as any)}
                  className="px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground"
                >
                  <option value="date_desc">Sort: Newest First</option>
                  <option value="date_asc">Sort: Oldest First</option>
                  <option value="name">Sort: Name (A–Z)</option>
                  <option value="mode">Sort: Cipher Mode</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const unrefIds = dictionaries
                      .filter(k => (k.associated_poem_titles?.length ?? 0) === 0)
                      .map(k => k.id);
                    setSelectedKeyIdsForBulk(new Set(unrefIds));
                  }}
                  className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Select All Unreferenced Test Keys
                </button>

                {selectedKeyIdsForBulk.size > 0 && (
                  <button
                    onClick={() => setConfirmBulkDelete(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-xs font-semibold text-rose-300 hover:bg-rose-500/30 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Selected ({selectedKeyIdsForBulk.size})
                  </button>
                )}

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import `.mckey`
                </button>
              </div>
            </div>

            {/* Bulk Delete Confirmation Banner */}
            {confirmBulkDelete && (
              <div className="px-6 py-3 bg-rose-500/15 border-b border-rose-500/30 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-xs text-rose-200">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    Confirm deleting <strong>{selectedKeyIdsForBulk.size}</strong> selected Cipher Key(s)? Keys referenced by saved poems will be automatically protected.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleBulkDeleteSelectedKeys}
                    className="px-3 py-1 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500"
                  >
                    Confirm Bulk Delete
                  </button>
                  <button
                    onClick={() => setConfirmBulkDelete(false)}
                    className="px-3 py-1 rounded-lg border border-border bg-card text-xs text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Key List & Details Drawer */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {filteredLibraryKeys.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No Cipher Keys match the current filter.
                </div>
              ) : (
                filteredLibraryKeys.map(key => {
                  const refTitles = key.associated_poem_titles ?? [];
                  const isReferenced = refTitles.length > 0;
                  const isChecked = selectedKeyIdsForBulk.has(key.id);
                  const isInspecting = inspectingKeyId === key.id;
                  const isRenaming = renamingKeyId === key.id;
                  const isConfirmingDelete = confirmDeleteKeyId === key.id;
                  const keyKind = classifyCipherKey(key);

                  return (
                    <div
                      key={key.id}
                      className="rounded-xl border border-border/80 bg-card/70 p-4 space-y-3 transition-all"
                    >
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isReferenced}
                            onChange={e => {
                              setSelectedKeyIdsForBulk(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(key.id);
                                else next.delete(key.id);
                                return next;
                              });
                            }}
                            title={
                              isReferenced
                                ? 'Referenced by a saved poem — protected from bulk delete'
                                : 'Select for bulk delete'
                            }
                            className="accent-primary cursor-pointer disabled:opacity-30"
                          />

                          <span className="px-2 py-0.5 rounded bg-primary/15 border border-primary/30 text-[11px] font-mono uppercase text-primary font-semibold">
                            {key.mode || 'manual'}
                          </span>

                          <span
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-medium border',
                              keyKind === 'poem_key'
                                ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                                : 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                            )}
                          >
                            {keyKind === 'poem_key' ? 'Poem Cipher Key' : 'Reusable Dictionary'}
                          </span>

                          {isRenaming ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={renameKeyDraft}
                                onChange={e => setRenameKeyDraft(e.target.value)}
                                className="px-2.5 py-1 rounded bg-background border border-primary text-xs text-foreground"
                              />
                              <button
                                onClick={() => handleRenameKey(key, renameKeyDraft)}
                                className="px-2.5 py-1 rounded bg-primary text-primary-foreground text-xs font-semibold"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setRenamingKeyId(null)}
                                className="px-2 py-1 rounded border border-border text-xs text-muted-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <span
                              className="text-sm font-semibold text-foreground truncate"
                              title={key.name}
                            >
                              {truncateDisplayLabel(key.name, 54)}
                            </span>
                          )}

                          <span className="text-xs font-mono text-muted-foreground">
                            ({key.mappings.length} mappings)
                          </span>

                          {isReferenced ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-300 font-medium">
                              <Lock className="w-3 h-3" />
                              Poem: {truncateDisplayLabel(refTitles.join(', '), 36)}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-muted text-[11px] text-muted-foreground">
                              Unreferenced
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedDecodeKeyId(key.id);
                              setShowDecodeKeySelector(false);
                              setActiveTab('decode');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-primary/15 border border-primary/30 text-xs font-medium text-primary hover:bg-primary/25 transition-colors"
                          >
                            Use for Decode
                          </button>
                          <button
                            onClick={() => handleCopyKeyId(key.id)}
                            className="p-1.5 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground"
                            title="Copy Key ID"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setRenamingKeyId(key.id);
                              setRenameKeyDraft(key.name);
                            }}
                            className="p-1.5 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground"
                            title="Rename Key"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              setInspectingKeyId(isInspecting ? null : key.id)
                            }
                            className="p-1.5 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground"
                            title="View Full Key Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleExportCipherKey(key)}
                            className="p-1.5 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground"
                            title="Export .mckey"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteKeyId(key.id)}
                            className="p-1.5 rounded-lg border border-border bg-background text-muted-foreground hover:text-rose-400"
                            title="Delete Key"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Single-Key Delete Confirmation / Protection Warning */}
                      {isConfirmingDelete && (
                        <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-between gap-4 text-xs">
                          <div className="text-rose-200">
                            {isReferenced ? (
                              <>
                                <strong>Warning — Key Referenced by Saved Poem(s):</strong> Deleting{' '}
                                <code>{truncateDisplayLabel(key.name, 40)}</code> may make{' '}
                                <strong>{refTitles.join(', ')}</strong> impossible to decode!
                              </>
                            ) : (
                              <>
                                Are you sure you want to delete unreferenced key{' '}
                                <strong>{truncateDisplayLabel(key.name, 40)}</strong>?
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {!isReferenced ? (
                              <button
                                onClick={() => handleDeleteKey(key.id, false)}
                                className="px-3 py-1 rounded bg-rose-600 text-white font-semibold"
                              >
                                Delete Key
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDeleteKey(key.id, true)}
                                className="px-3 py-1 rounded bg-rose-700 text-white font-semibold"
                                title="Force delete even though a saved poem references this key"
                              >
                                Force Delete Anyway
                              </button>
                            )}
                            <button
                              onClick={() => setConfirmDeleteKeyId(null)}
                              className="px-2.5 py-1 rounded border border-border bg-card text-foreground"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Expandable Full Key Details Inspector */}
                      {isInspecting && (
                        <div className="p-3.5 rounded-lg bg-background/80 border border-border/70 text-xs space-y-2">
                          <div className="font-semibold text-foreground">
                            Full Key Name: {key.name}
                          </div>
                          <div className="grid grid-cols-2 gap-2 font-mono text-[11px] text-muted-foreground">
                            <div>Key ID: {key.id}</div>
                            <div>Created: {key.created_at}</div>
                            <div>Source FP: {key.source_fingerprint || 'None (Reusable Manual)'}</div>
                            <div>Encoded FP: {key.encoded_fingerprint || 'None (Reusable Manual)'}</div>
                            <div>
                              Manifest Spans: {key.manifest?.substitutions?.length ?? 0} recorded
                            </div>
                            <div>
                              Verification:{' '}
                              {key.source_fingerprint && key.encoded_fingerprint
                                ? 'Fingerprint & Manifest Verified'
                                : 'Heuristic / Legacy Dictionary'}
                            </div>
                          </div>
                          <div className="pt-2 border-t border-border/50 max-h-40 overflow-y-auto flex flex-wrap gap-1.5">
                            {key.mappings.map((m, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded bg-card border border-border/60 font-mono text-[11px]"
                              >
                                {m.original} → {m.replacement}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Scope Conflict Resolution Dialog */}
        {isConflictModalOpen && conflictReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-2 text-foreground font-semibold text-base">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <span>Resolve Conflicting Stanza Rules</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The following words have different substitution rules across different stanzas. Choose which replacement to unify across the whole poem before switching to Whole Poem mode:
              </p>
              <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
                {conflictReport.conflictingWords.map(item => {
                  const normWord = item.original.toLowerCase();
                  return (
                    <div key={normWord} className="p-3 rounded-xl border border-border/70 bg-muted/20 space-y-2">
                      <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                        <span className="text-primary font-mono font-bold">"{item.original}"</span>
                        <span className="text-[11px] text-muted-foreground">has conflicting replacements:</span>
                      </div>
                      <div className="space-y-1.5 pl-2">
                        {item.replacements.map((opt, oIdx: number) => (
                          <label
                            key={oIdx}
                            className="flex items-center gap-2 text-xs text-foreground cursor-pointer"
                          >
                            <input
                              type="radio"
                              name={`conflict-${normWord}`}
                              value={opt.replacement}
                              checked={conflictChoices[normWord] === opt.replacement}
                              onChange={() =>
                                setConflictChoices(prev => ({ ...prev, [normWord]: opt.replacement }))
                              }
                              className="text-primary focus:ring-primary"
                            />
                            <span>
                              Stanza {opt.stanzaIndex + 1}: <strong className="font-mono text-primary">{opt.replacement}</strong>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => {
                    setIsConflictModalOpen(false);
                    setConflictReport(null);
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  Cancel (Stay in Per-Stanza)
                </button>
                <button
                  type="button"
                  onClick={handleConfirmConflictSwitch}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 shadow-sm transition-all"
                >
                  Confirm & Switch to Whole Poem
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
