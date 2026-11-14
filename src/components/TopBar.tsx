import React from 'react';
import { Download } from 'lucide-react';

interface TopBarProps {
  onExportClick: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onExportClick }) => {
  return (
    <header className="sticky top-0 z-40 border-b border-[#2a3038] bg-[#1a1e23]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-8 px-6 py-3.5">
        <a
          href="#top"
          className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0 transition-colors hover:text-[#fbbc05]"
        >
          Slovenská speleologická spoločnosť
        </a>

        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-[#c8cfd8]">
          <a
            href="#atlas"
            className="whitespace-nowrap shrink-0 transition-colors hover:text-[#fbbc05]"
          >
            Atlas a mapa
          </a>
          <a
            href="#rebricky"
            className="whitespace-nowrap shrink-0 transition-colors hover:text-[#fbbc05]"
          >
            Rebríčky
          </a>
          <a
            href="#spravodaj-ocr"
            className="whitespace-nowrap shrink-0 transition-colors hover:text-[#fbbc05]"
          >
            Spravodaj OCR
          </a>
          <a
            href="#bibliografia"
            className="whitespace-nowrap shrink-0 transition-colors hover:text-[#fbbc05]"
          >
            Bibliografia
          </a>
          <a
            href="#admin"
            className="whitespace-nowrap shrink-0 transition-colors hover:text-[#fbbc05]"
          >
            Admin
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onExportClick}
            className="inline-flex items-center gap-2 rounded-md bg-[#fbbc05] px-4 py-2 text-xs font-semibold text-[#1a1e23] whitespace-nowrap shrink-0 transition-colors hover:bg-[#eab004] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbbc05]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Exportovať správu
          </button>
        </div>
      </div>
    </header>
  );
};
