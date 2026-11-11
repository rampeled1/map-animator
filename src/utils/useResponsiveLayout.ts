import { useState, useEffect } from 'react';
import type { StepId } from '../types/index.ts';

export type ViewportTier =
  | 'small-mobile'      // 320–390px
  | 'large-mobile'      // 391–767px
  | 'tablet-portrait'   // 768–1023px
  | 'tablet-landscape'  // 1024–1279px
  | 'desktop';          // >= 1280px

export type InterfaceExperience = 'mobile' | 'tablet' | 'desktop';

export type MobileStageId = 'journey' | 'style' | 'personalize' | 'video';

export type MobileSheetSnap = 'map' | 'split' | 'full';

export interface MobileStageDefinition {
  id: MobileStageId;
  num: number;
  shortLabel: string;
  fullTitle: string;
  steps: { id: StepId; label: string }[];
}

export const MOBILE_STAGES: MobileStageDefinition[] = [
  {
    id: 'journey',
    num: 1,
    shortLabel: 'Journey',
    fullTitle: 'Stage 1 · Create Journey',
    steps: [{ id: 'route', label: 'Route' }],
  },
  {
    id: 'style',
    num: 2,
    shortLabel: 'Style',
    fullTitle: 'Stage 2 · Choose Style',
    steps: [
      { id: 'camera', label: 'Camera' },
      { id: 'map', label: 'Map' },
      { id: 'line', label: 'Line' },
    ],
  },
  {
    id: 'personalize',
    num: 3,
    shortLabel: 'Personalize',
    fullTitle: 'Stage 3 · Personalize',
    steps: [
      { id: 'title', label: 'Title' },
      { id: 'signs', label: 'Photos' },
      { id: 'overlays', label: 'Info' },
    ],
  },
  {
    id: 'video',
    num: 4,
    shortLabel: 'Video',
    fullTitle: 'Stage 4 · Create Video',
    steps: [{ id: 'preview', label: 'Video' }],
  },
];

export function getStageForStep(step: StepId): MobileStageId {
  switch (step) {
    case 'route':
      return 'journey';
    case 'camera':
    case 'map':
    case 'line':
      return 'style';
    case 'title':
    case 'signs':
    case 'overlays':
      return 'personalize';
    case 'preview':
      return 'video';
    default:
      return 'journey';
  }
}

export function getDefaultStepForStage(stage: MobileStageId): StepId {
  switch (stage) {
    case 'journey':
      return 'route';
    case 'style':
      return 'camera';
    case 'personalize':
      return 'title';
    case 'video':
      return 'preview';
  }
}

export function classifyViewport(width: number, height: number): {
  width: number;
  height: number;
  tier: ViewportTier;
  experience: InterfaceExperience;
  isPortrait: boolean;
} {
  const isPortrait = height >= width;
  let tier: ViewportTier;
  let experience: InterfaceExperience;

  if (width <= 390) {
    tier = 'small-mobile';
    experience = 'mobile';
  } else if (width < 768) {
    tier = 'large-mobile';
    experience = 'mobile';
  } else if (width < 1024) {
    tier = 'tablet-portrait';
    experience = 'tablet';
  } else if (width < 1280) {
    tier = 'tablet-landscape';
    experience = 'tablet';
  } else {
    tier = 'desktop';
    experience = 'desktop';
  }

  return { width, height, tier, experience, isPortrait };
}

export function useResponsiveLayout() {
  const [state, setState] = useState(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const h = typeof window !== 'undefined' ? window.innerHeight : 900;
    return classifyViewport(w, h);
  });

  useEffect(() => {
    const handleResize = () => {
      setState(classifyViewport(window.innerWidth, window.innerHeight));
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return state;
}
