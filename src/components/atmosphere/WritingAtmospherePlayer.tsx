import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Headphones,
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Repeat1,
  FolderOpen,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  AlertCircle,
  Radio,
} from 'lucide-react';
import type { AudioTrack, AtmosphereRepeatMode } from '../../types';
import { api } from '../../services/api';
import {
  loadAtmospherePreferences,
  saveAtmospherePreferences,
  filterTracksByCategory,
  getAvailableCategories,
  getNextTrack,
  getPreviousTrack,
  formatDuration,
  getAudioMimeType,
} from '../../utils/atmosphere';

export const WritingAtmospherePlayer: React.FC = () => {
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Preferences state
  const [prefs] = useState(() => loadAtmospherePreferences());
  const [volume, setVolume] = useState(prefs.volume);
  const [repeatMode, setRepeatMode] = useState<AtmosphereRepeatMode>(prefs.repeat_mode);
  const [selectedCategory, setSelectedCategory] = useState<string>(prefs.selected_category);
  const [isMuted, setIsMuted] = useState(false);
  const prevVolumeRef = useRef(prefs.volume || 0.5);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  // Sync volume state with HTML5 audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Persist preference updates
  useEffect(() => {
    saveAtmospherePreferences({
      volume,
      repeat_mode: repeatMode,
      selected_category: selectedCategory,
    });
  }, [volume, repeatMode, selectedCategory]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };
  }, []);

  // Fetch track list
  const refreshTracks = useCallback(async (autoSelectFirst = false) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const list = await api.musicListTracks();
      setTracks(list);
      if (autoSelectFirst && list.length > 0 && !currentTrack) {
        // Do not autoplay, just stage track
        setCurrentTrack(list[0]);
      }
    } catch (err) {
      console.error('Failed to list music tracks:', err);
      setErrorMsg('Could not scan Music directory');
    } finally {
      setIsLoading(false);
    }
  }, [currentTrack]);

  // Load tracks on mount
  useEffect(() => {
    void refreshTracks();
  }, [refreshTracks]);

  // Filter tracks by currently selected category
  const filteredTracks = useMemo(() => {
    return filterTracksByCategory(tracks, selectedCategory);
  }, [tracks, selectedCategory]);

  const categories = useMemo(() => {
    return getAvailableCategories(tracks);
  }, [tracks]);

  // Load and play a specific track
  const playTrack = useCallback(async (track: AudioTrack, autoPlay = true) => {
    setErrorMsg(null);
    setCurrentTrack(track);

    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }

    try {
      const bytes = await api.musicGetTrackBytes(track.relative_path);
      if (!bytes || bytes.length === 0) {
        throw new Error('Track returned empty audio data');
      }

      const mimeType = getAudioMimeType(track.format);
      const uint8Array = new Uint8Array(bytes);
      const blob = new Blob([uint8Array], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      currentBlobUrlRef.current = blobUrl;

      if (audioRef.current) {
        audioRef.current.src = blobUrl;
        audioRef.current.load();
        if (autoPlay) {
          const playPromise = audioRef.current.play();
          if (playPromise !== undefined) {
            await playPromise;
            setIsPlaying(true);
          }
        } else {
          setIsPlaying(false);
        }
      }
    } catch (err: any) {
      console.error('Failed to load audio track:', err);
      setErrorMsg(err?.message || 'Failed to play track');
      setIsPlaying(false);
    }
  }, []);

  // Play/Pause toggle
  const togglePlayPause = useCallback(async () => {
    if (!currentTrack) {
      // Pick first track from current filter or overall list
      const candidate = filteredTracks[0] || tracks[0];
      if (candidate) {
        await playTrack(candidate, true);
      } else {
        setErrorMsg('No audio tracks found in Music directory');
      }
      return;
    }

    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err: any) {
        console.error('Audio playback error:', err);
        // If src is missing or invalid, reload track
        if (!audioRef.current.src || audioRef.current.src === '') {
          await playTrack(currentTrack, true);
        } else {
          setErrorMsg(err?.message || 'Playback failed');
        }
      }
    }
  }, [currentTrack, filteredTracks, tracks, isPlaying, playTrack]);

  // Next Track handler
  const handleNextTrack = useCallback(async (isAutoAdvance = false) => {
    const list = filteredTracks.length > 0 ? filteredTracks : tracks;
    const next = getNextTrack(list, currentTrack?.id || null, repeatMode);
    if (next) {
      await playTrack(next, true);
    } else {
      if (isAutoAdvance) {
        setIsPlaying(false);
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
        }
      }
    }
  }, [filteredTracks, tracks, currentTrack, repeatMode, playTrack]);

  // Previous Track handler
  const handlePrevTrack = useCallback(async () => {
    // If more than 3 seconds into song, restart it
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }

    const list = filteredTracks.length > 0 ? filteredTracks : tracks;
    const prev = getPreviousTrack(list, currentTrack?.id || null);
    if (prev) {
      await playTrack(prev, true);
    }
  }, [filteredTracks, tracks, currentTrack, playTrack]);

  // Handle track ending
  const handleAudioEnded = useCallback(() => {
    if (repeatMode === 'one' && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play();
    } else {
      void handleNextTrack(true);
    }
  }, [repeatMode, handleNextTrack]);

  // Repeat mode cycle
  const cycleRepeatMode = useCallback(() => {
    setRepeatMode(prev => {
      if (prev === 'all') return 'one';
      if (prev === 'one') return 'off';
      return 'all';
    });
  }, []);

  // Mute toggle
  const toggleMute = useCallback(() => {
    if (isMuted) {
      setIsMuted(false);
      setVolume(prevVolumeRef.current || 0.5);
    } else {
      prevVolumeRef.current = volume;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const handleOpenFolder = async () => {
    try {
      await api.musicOpenFolder();
    } catch (err: any) {
      console.error('Failed to open music folder:', err);
      setErrorMsg('Could not open folder');
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = Number(e.target.value);
    setCurrentTime(targetTime);
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (isMuted && val > 0) {
      setIsMuted(false);
    }
  };

  return (
    <>
      {/* Hidden Native Audio Element */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration || 0);
          }
        }}
        onEnded={handleAudioEnded}
        onError={() => {
          setErrorMsg('Audio playback failed or format not supported');
          setIsPlaying(false);
        }}
      />

      {/* Expanded Player Overlay Modal/Card */}
      {isExpanded && (
        <div
          className="fixed bottom-16 right-5 w-84 sm:w-96 bg-card/95 border border-border shadow-2xl rounded-2xl z-50 overflow-hidden flex flex-col backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200"
          role="region"
          aria-label="Writing Atmosphere expanded player"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Headphones className="w-4 h-4 text-primary" />
              <span className="font-serif font-medium text-sm text-foreground">
                Writing Atmosphere
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleOpenFolder}
                title="Open Music Folder in File Explorer"
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                aria-label="Open Music Folder"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => void refreshTracks(false)}
                title="Rescan Music Folder"
                className={`p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors ${
                  isLoading ? 'animate-spin' : ''
                }`}
                aria-label="Rescan Music Folder"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                title="Minimize player"
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors ml-1"
                aria-label="Minimize player"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="px-3 py-2 bg-muted/20 border-b border-border flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {categories.map(cat => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="mx-3 mt-2 p-2 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="p-0.5 hover:opacity-70"
                aria-label="Dismiss error"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Tracklist */}
          <div className="px-2 py-2 max-h-48 overflow-y-auto space-y-1 divide-y divide-border/20">
            {isLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 opacity-60" />
                Scanning music directory...
              </div>
            ) : filteredTracks.length === 0 ? (
              <div className="py-6 px-3 text-center text-xs text-muted-foreground space-y-2">
                <p>No audio files found for this category.</p>
                <p className="text-[11px] text-muted-foreground/80">
                  Import external tracks (e.g. from FlowMusic) into your local Music folder.
                </p>
                <button
                  type="button"
                  onClick={handleOpenFolder}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-muted hover:bg-muted/80 text-foreground rounded-md border border-border transition-colors mt-1"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Open Music Folder
                </button>
              </div>
            ) : (
              filteredTracks.map(track => {
                const isSelected = currentTrack?.id === track.id;
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => void playTrack(track, true)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between group transition-colors ${
                      isSelected
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-foreground/90 hover:bg-muted/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      {isSelected && isPlaying ? (
                        <Radio className="w-3.5 h-3.5 shrink-0 text-primary animate-pulse" />
                      ) : (
                        <Music className="w-3.5 h-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                      )}
                      <span className="truncate">{track.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] uppercase font-mono px-1 py-0.5 rounded bg-muted/60 text-muted-foreground">
                        {track.format}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Current Track Playback Controls */}
          <div className="p-3 bg-muted/30 border-t border-border space-y-2">
            {/* Timeline Progress Bar */}
            <div className="space-y-1">
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1 bg-border rounded-lg appearance-none cursor-pointer accent-primary"
                aria-label="Track progress seek bar"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>{formatDuration(currentTime)}</span>
                <span>{formatDuration(duration)}</span>
              </div>
            </div>

            {/* Playback Buttons */}
            <div className="flex items-center justify-between pt-1">
              {/* Repeat Button */}
              <button
                type="button"
                onClick={cycleRepeatMode}
                title={`Repeat Mode: ${repeatMode}`}
                className={`p-1.5 rounded-md transition-colors ${
                  repeatMode !== 'off'
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                aria-label={`Cycle repeat mode, currently ${repeatMode}`}
              >
                {repeatMode === 'one' ? (
                  <Repeat1 className="w-4 h-4" />
                ) : (
                  <Repeat className="w-4 h-4" />
                )}
              </button>

              {/* Prev / Play / Next */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handlePrevTrack()}
                  title="Previous Track"
                  className="p-1.5 text-foreground hover:bg-muted rounded-full transition-colors"
                  aria-label="Previous Track"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void togglePlayPause()}
                  title={isPlaying ? 'Pause' : 'Play'}
                  className="p-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full shadow transition-transform active:scale-95"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4 translate-x-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void handleNextTrack(false)}
                  title="Next Track"
                  className="p-1.5 text-foreground hover:bg-muted rounded-full transition-colors"
                  aria-label="Next Track"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Volume Slider & Mute */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleMute}
                  title={isMuted ? 'Unmute' : 'Mute'}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-destructive" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 bg-border rounded-lg appearance-none cursor-pointer accent-primary"
                  aria-label="Volume slider"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Docked Bottom-Right Trigger Pill */}
      <div
        className="fixed bottom-4 right-5 z-40 flex items-center"
        role="region"
        aria-label="Writing Atmosphere Player"
      >
        <div className="flex items-center gap-2 bg-card/90 backdrop-blur-md border border-border shadow-lg rounded-full px-3 py-1.5 text-xs text-foreground transition-all hover:bg-card">
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            title="Toggle Writing Atmosphere Player"
            aria-label="Toggle Writing Atmosphere Player"
          >
            <div
              className={`p-1 rounded-full ${
                isPlaying ? 'bg-primary/20 text-primary animate-pulse' : 'text-muted-foreground'
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
            </div>
            <span className="font-serif font-medium truncate max-w-[140px] sm:max-w-[180px] text-foreground">
              {currentTrack ? currentTrack.title : 'Atmosphere'}
            </span>
          </button>

          <div className="h-3 w-px bg-border/60 mx-0.5" />

          {/* Quick Play/Pause */}
          <button
            type="button"
            onClick={() => void togglePlayPause()}
            className="p-1 text-foreground hover:text-primary rounded-full transition-colors"
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          {/* Quick Next */}
          <button
            type="button"
            onClick={() => void handleNextTrack(false)}
            className="p-1 text-muted-foreground hover:text-foreground rounded-full transition-colors"
            title="Next Track"
            aria-label="Next Track"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          {/* Expand/Collapse Chevron */}
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className="p-1 text-muted-foreground hover:text-foreground rounded-full transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand Atmosphere'}
            aria-label={isExpanded ? 'Collapse' : 'Expand Atmosphere'}
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </>
  );
};
