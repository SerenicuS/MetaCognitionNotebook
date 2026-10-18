import React, { useState, useEffect } from 'react';
import { DocumentType } from '@/types';

// Dark theme display derivatives (calibrated ~92% visible artwork, gold on charcoal)
import logoHorizontalDark from '@/assets/brand/display/logo-horizontal-display.jpg';
import appIconSquareDark from '@/assets/brand/display/app-icon-square-display.png';
import studioPoetryDark from '@/assets/brand/display/studio-poetry-display.jpg';
import studioPhilosophyDark from '@/assets/brand/display/studio-philosophy-display.jpg';
import studioLorebookDark from '@/assets/brand/display/studio-lorebook-display.jpg';

// Light theme display derivatives (calibrated ~92% visible artwork, gold on ivory)
import logoHorizontalLight from '@/assets/brand/display/brand-horizontal-display-light.jpg';
import appIconSquareLight from '@/assets/brand/display/app-icon-square-display-light.png';
import studioPoetryLight from '@/assets/brand/display/studio-poetry-display-light.jpg';
import studioPhilosophyLight from '@/assets/brand/display/studio-philosophy-display-light.jpg';
import studioLorebookLight from '@/assets/brand/display/studio-lorebook-display-light.jpg';

import vaultDark from '@/assets/brand/vault.jpg';
import vaultLight from '@/assets/brand/vault-light.jpg';
import { vaultAsset } from '@/utils/theme';
import { cn } from '@/utils/cn';

/**
 * Hook to observe active application theme mode ('dark' vs 'light').
 * Listens to document.documentElement.classList for instantaneous updates
 * when theme changes anywhere in the app, without requiring a page refresh.
 */
export function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === 'undefined') return true;
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains('dark'));
    update();

    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.attributeName === 'class') {
          update();
        }
      }
    });

    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMedia = () => update();
    media.addEventListener('change', handleMedia);

    return () => {
      observer.disconnect();
      media.removeEventListener('change', handleMedia);
    };
  }, []);

  return isDark;
}

export const BRAND_ASSETS = {
  dark: {
    logoHorizontal: logoHorizontalDark,
    appIcon: appIconSquareDark,
    studioPoetry: studioPoetryDark,
    studioPhilosophy: studioPhilosophyDark,
    studioLorebook: studioLorebookDark,
  },
  light: {
    logoHorizontal: logoHorizontalLight,
    appIcon: appIconSquareLight,
    studioPoetry: studioPoetryLight,
    studioPhilosophy: studioPhilosophyLight,
    studioLorebook: studioLorebookLight,
  },
  // Backwards compatibility defaults
  logoHorizontal: logoHorizontalDark,
  appIcon: appIconSquareDark,
  studioPoetry: studioPoetryDark,
  studioPhilosophy: studioPhilosophyDark,
  studioLorebook: studioLorebookDark,
} as const;

interface BrandLogoProps {
  className?: string;
  alt?: string;
  theme?: 'dark' | 'light';
}

/**
 * MetaCognition Notebook horizontal wordmark + monogram logo.
 * Automatically switches between gold-on-charcoal (dark) and gold-on-ivory (light).
 */
export const BrandHorizontalLogo: React.FC<BrandLogoProps> = ({
  className = 'h-10 w-auto',
  alt = 'MetaCognition Notebook',
  theme: forcedTheme,
}) => {
  const activeIsDark = useIsDarkTheme();
  const isDark = forcedTheme ? forcedTheme === 'dark' : activeIsDark;
  const src = isDark ? logoHorizontalDark : logoHorizontalLight;

  return (
    <img
      src={src}
      alt={alt}
      className={cn('object-contain select-none pointer-events-none rounded brand-asset-frame', className)}
      loading="eager"
    />
  );
};

/**
 * MetaCognition Notebook square application emblem.
 * Uses exact 1:1 square master asset with centered open book monogram.
 * Automatically switches between gold-on-charcoal (dark) and gold-on-ivory (light).
 */
export const BrandSquareIcon: React.FC<BrandLogoProps> = ({
  className = 'w-11 h-11',
  alt = 'MetaCognition Notebook Icon',
  theme: forcedTheme,
}) => {
  const activeIsDark = useIsDarkTheme();
  const isDark = forcedTheme ? forcedTheme === 'dark' : activeIsDark;
  const src = isDark ? appIconSquareDark : appIconSquareLight;

  return (
    <img
      src={src}
      alt={alt}
      className={cn('object-contain select-none pointer-events-none shrink-0 rounded-md brand-asset-frame', className)}
      loading="eager"
    />
  );
};

export interface StudioIconProps {
  type: DocumentType;
  className?: string;
  alt?: string;
  isActive?: boolean;
  theme?: 'dark' | 'light';
}

const STUDIO_DARK_MAP: Record<DocumentType, { src: string; label: string }> = {
  poetry: {
    src: studioPoetryDark,
    label: 'Poetry Studio Icon',
  },
  philosophy: {
    src: studioPhilosophyDark,
    label: 'Philosophy Studio Icon',
  },
  lorebook: {
    src: studioLorebookDark,
    label: 'Lorebook Studio Icon',
  },
};

const STUDIO_LIGHT_MAP: Record<DocumentType, { src: string; label: string }> = {
  poetry: {
    src: studioPoetryLight,
    label: 'Poetry Studio Icon',
  },
  philosophy: {
    src: studioPhilosophyLight,
    label: 'Philosophy Studio Icon',
  },
  lorebook: {
    src: studioLorebookLight,
    label: 'Lorebook Studio Icon',
  },
};

/**
 * Official Studio Icons (Poetry, Philosophy, Lorebook).
 * Automatically switches between dark gold-on-charcoal and light gold-on-ivory artwork,
 * preserving original artwork and proportions across all UI elements.
 */
export const StudioIcon: React.FC<StudioIconProps> = ({
  type,
  className = 'w-9 h-9',
  alt,
  isActive = false,
  theme: forcedTheme,
}) => {
  const activeIsDark = useIsDarkTheme();
  const isDark = forcedTheme ? forcedTheme === 'dark' : activeIsDark;
  const asset = (isDark ? STUDIO_DARK_MAP : STUDIO_LIGHT_MAP)[type];
  if (!asset) return null;

  return (
    <img
      src={asset.src}
      alt={alt || asset.label}
      className={cn(
        'object-contain select-none pointer-events-none shrink-0 rounded-md brand-asset-frame',
        isActive ? 'studio-icon-gold-active' : 'studio-icon-gold',
        className
      )}
      loading="eager"
    />
  );
};

/** Official unmodified JPEG masters: ~70% visible artwork, compensated by a 64px frame. */
export const VaultEmblem: React.FC<{ className?: string }> = ({ className = 'w-16 h-16' }) => {
  const isDark = useIsDarkTheme();
  return <img src={vaultAsset(isDark, vaultDark, vaultLight)} alt="The Vault emblem"
    className={cn('object-contain shrink-0 select-none pointer-events-none rounded-md', className)} loading="eager" />;
};
