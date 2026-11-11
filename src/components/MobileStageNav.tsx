import React from 'react';
import type { StepId } from '../types';
import {
  MOBILE_STAGES,
  MobileStageId,
  MobileSheetSnap,
  getStageForStep,
} from '../utils/useResponsiveLayout';
import {
  Navigation,
  Sliders,
  Sparkles,
  Film,
  Maximize2,
  Minimize2,
  Columns,
} from 'lucide-react';

interface MobileSheetHeaderProps {
  currentStep: StepId;
  onSelectStep: (step: StepId) => void;
  sheetSnap: MobileSheetSnap;
  onSetSheetSnap: (snap: MobileSheetSnap) => void;
}

export const MobileSheetHeader: React.FC<MobileSheetHeaderProps> = ({
  currentStep,
  onSelectStep,
  sheetSnap,
  onSetSheetSnap,
}) => {
  const activeStageId = getStageForStep(currentStep);
  const activeStage = MOBILE_STAGES.find((s) => s.id === activeStageId) || MOBILE_STAGES[0];

  const cycleSheetSnap = () => {
    if (sheetSnap === 'split') onSetSheetSnap('full');
    else if (sheetSnap === 'full') onSetSheetSnap('map');
    else onSetSheetSnap('split');
  };

  return (
    <div className="bg-[#0f172a] border-t border-b border-slate-800 px-3 pt-2 pb-2.5 shrink-0 select-none">
      {/* Drag / Tap Handle Bar */}
      <div className="flex flex-col items-center mb-1.5">
        <button
          type="button"
          onClick={cycleSheetSnap}
          aria-label="Toggle editing panel size"
          className="w-16 h-4 flex items-center justify-center cursor-pointer"
        >
          <span className="w-10 h-1.5 rounded-full bg-slate-600 hover:bg-teal-400 transition-colors" />
        </button>
      </div>

      {/* Stage Title Row + Sheet Snap Controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-teal-400 block truncate">
            {activeStage.fullTitle}
          </span>
        </div>

        {/* Sheet Size Switcher (Map / Split / Full) */}
        <div
          className="flex items-center bg-[#1e293b] border border-slate-700 rounded-lg p-0.5 shrink-0"
          role="group"
          aria-label="Sheet view mode"
        >
          <button
            type="button"
            onClick={() => onSetSheetSnap('map')}
            className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-all min-h-[32px] ${
              sheetSnap === 'map'
                ? 'bg-teal-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
            title="Maximize Map Preview"
          >
            <Minimize2 className="w-3 h-3" />
            <span>Map</span>
          </button>
          <button
            type="button"
            onClick={() => onSetSheetSnap('split')}
            className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-all min-h-[32px] ${
              sheetSnap === 'split'
                ? 'bg-teal-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
            title="Split Map and Editor"
          >
            <Columns className="w-3 h-3" />
            <span>Split</span>
          </button>
          <button
            type="button"
            onClick={() => onSetSheetSnap('full')}
            className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-all min-h-[32px] ${
              sheetSnap === 'full'
                ? 'bg-teal-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
            title="Expand Editor Sheet"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Full</span>
          </button>
        </div>
      </div>

      {/* Sub-step Segmented Switcher for Grouped Stages (Stage 2: Style, Stage 3: Personalize) */}
      {activeStage.steps.length > 1 && sheetSnap !== 'map' && (
        <div
          className="grid grid-cols-3 gap-1.5 mt-2.5 bg-[#1e293b] p-1 rounded-xl border border-slate-700/80"
          role="tablist"
          aria-label={`${activeStage.shortLabel} sub-steps`}
        >
          {activeStage.steps.map((sub) => {
            const isSubActive = currentStep === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                role="tab"
                aria-selected={isSubActive}
                onClick={() => onSelectStep(sub.id)}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all min-h-[38px] flex items-center justify-center ${
                  isSubActive
                    ? 'bg-teal-500 text-slate-950 shadow-md'
                    : 'text-slate-300 hover:text-white bg-transparent'
                }`}
              >
                {sub.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface MobileBottomStageBarProps {
  currentStep: StepId;
  onSelectStage: (stageId: MobileStageId) => void;
}

export const MobileBottomStageBar: React.FC<MobileBottomStageBarProps> = ({
  currentStep,
  onSelectStage,
}) => {
  const activeStageId = getStageForStep(currentStep);

  const getStageIcon = (id: MobileStageId) => {
    switch (id) {
      case 'journey':
        return <Navigation className="w-4 h-4" />;
      case 'style':
        return <Sliders className="w-4 h-4" />;
      case 'personalize':
        return <Sparkles className="w-4 h-4" />;
      case 'video':
        return <Film className="w-4 h-4" />;
    }
  };

  return (
    <nav
      aria-label="Mobile 4-stage workflow"
      className="bg-[#0f172a] border-t border-slate-800 px-1.5 py-1 grid grid-cols-4 gap-1 shrink-0 z-30"
    >
      {MOBILE_STAGES.map((stage) => {
        const isActive = stage.id === activeStageId;
        return (
          <button
            key={stage.id}
            type="button"
            onClick={() => onSelectStage(stage.id)}
            aria-current={isActive ? 'step' : undefined}
            className={`min-h-[48px] px-1 py-1 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer border ${
              isActive
                ? 'bg-teal-500/15 border-teal-500 text-teal-400 font-bold'
                : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-1">
              {getStageIcon(stage.id)}
              <span className="text-[10px] font-mono opacity-75">{stage.num}.</span>
            </div>
            <span className="text-[11px] leading-tight truncate max-w-full">
              {stage.shortLabel}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
