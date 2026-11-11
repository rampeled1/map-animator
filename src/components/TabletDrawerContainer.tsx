import React from 'react';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';

interface TabletDrawerContainerProps {
  isOpen: boolean;
  onToggle: () => void;
  isOverlayMode: boolean; // true on tablet portrait (768–1023px), false on tablet landscape (1024–1279px)
  activeStepLabel: string;
  children: React.ReactNode;
}

export const TabletDrawerContainer: React.FC<TabletDrawerContainerProps> = ({
  isOpen,
  onToggle,
  isOverlayMode,
  activeStepLabel,
  children,
}) => {
  if (isOverlayMode) {
    // Tablet Portrait: Slide-over drawer so the 3D map keeps 100% full width underneath
    return (
      <>
        <div
          className={`tablet-drawer-overlay absolute top-0 bottom-0 left-0 z-20 flex transition-transform duration-300 ease-in-out ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ width: '340px', maxWidth: '86vw' }}
        >
          <div className="w-full h-full overflow-hidden shadow-2xl border-r border-slate-700 bg-[#0f172a] flex flex-col">
            {children}
          </div>

          {/* Touch-friendly Floating Collapse/Expand Handle Tab on Right Edge */}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-label={isOpen ? 'Collapse editing panel' : `Open ${activeStepLabel} panel`}
            className="self-start mt-4 -mr-11 w-11 min-h-[48px] rounded-r-xl bg-[#0f172a] border border-l-0 border-slate-700 text-teal-400 hover:text-teal-300 shadow-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer"
            title={isOpen ? 'Collapse panel to expand map' : `Open ${activeStepLabel} panel`}
          >
            {isOpen ? (
              <ChevronLeft className="w-5 h-5" />
            ) : (
              <>
                <SlidersHorizontal className="w-4 h-4" />
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </>
    );
  }

  // Tablet Landscape (1024–1279px): Collapsible docked drawer that resizes the map flex stage
  return (
    <div className="relative h-full flex shrink-0 z-20">
      <div
        className={`h-full overflow-hidden transition-all duration-300 ease-in-out bg-[#0f172a] ${
          isOpen ? 'w-[340px] border-r border-slate-800' : 'w-0 border-r-0'
        }`}
      >
        <div className="w-[340px] h-full">{children}</div>
      </div>

      {/* Persistent Touch Handle on the Divider */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Collapse editing panel' : `Open ${activeStepLabel} panel`}
        className="absolute top-4 -right-9 z-30 w-9 min-h-[46px] rounded-r-xl bg-[#0f172a] border border-l-0 border-slate-700 text-teal-400 hover:text-teal-300 shadow-lg flex items-center justify-center cursor-pointer"
        title={isOpen ? 'Collapse panel' : 'Expand panel'}
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
    </div>
  );
};
