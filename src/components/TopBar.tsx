import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Braces, Download, Github, Globe2, LogIn, LogOut, X } from 'lucide-react';

export type AppView = 'rankings' | 'map' | 'presentations' | 'bibliography' | 'ocr' | 'admin';

interface TopBarProps {
  onExportClick: () => void;
  activeView: AppView;
  isAdmin: boolean;
  onLogin: (username: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

const resourceLinks = [
  { href: 'https://github.com/dankez/rebricek_jaskyn_sss', label: 'GitHub', icon: Github },
  { href: 'https://sss.sk/', label: 'sss.sk', icon: Globe2 },
  { href: '/api/caves', label: 'Verejné API', icon: Braces },
  { href: 'https://bibliografia.sss.sk/', label: 'Bibliografia', icon: BookOpen },
];

export const TopBar: React.FC<TopBarProps> = ({
  onExportClick,
  activeView,
  isAdmin,
  onLogin,
  onLogout,
}) => {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [username, setUsername] = useState(import.meta.env.DEV ? 'jan' : '');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const loginDialogRef = useRef<HTMLDialogElement>(null);
  const loginTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = loginDialogRef.current;
    if (!dialog) return;
    if (isLoginOpen && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>('[autocomplete="username"]')?.focus();
    } else if (!isLoginOpen && dialog.open) {
      dialog.close();
      loginTriggerRef.current?.focus();
      loginTriggerRef.current = null;
    }
  }, [isLoginOpen]);

  const openLogin = () => {
    loginTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAuthError(null);
    setIsLoginOpen(true);
  };

  const links: Array<{ id: AppView; label: string }> = [
    { id: 'rankings', label: 'Rebríček' },
    { id: 'map', label: 'Mapa jaskýň' },
    { id: 'presentations', label: 'Prezentácie' },
    { id: 'bibliography', label: 'Bibliografia' },
    ...(isAdmin
      ? [
          { id: 'ocr' as const, label: 'Spracovanie PDF' },
          { id: 'admin' as const, label: 'Správa rebríčkov' },
        ]
      : []),
  ];

  const submitLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setAuthError(null);
    try {
      await onLogin(username, password);
      setPassword('');
      setIsLoginOpen(false);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Prihlásenie zlyhalo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitLogout = async () => {
    setAuthError(null);
    try {
      await onLogout();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Odhlásenie zlyhalo.');
    }
  };

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-[#1a1e23] focus:shadow-xl"
      >
        Preskočiť na obsah
      </a>
      <header id="site-header" className="sticky top-0 z-40 border-b border-[#2a3038] bg-[#1a1e23]/95 backdrop-blur-md">
        <div className="mx-auto max-w-[1380px] px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <a
              href="#rankings"
              aria-label="Slovenská speleologická spoločnosť — rebríček jaskýň"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 font-display text-sm font-bold tracking-tight text-white sm:text-base whitespace-nowrap transition-colors hover:text-[#fbbc05]"
            >
              <img
                src="/assets/sss-logo.jpg"
                alt=""
                aria-hidden="true"
                width={44}
                height={44}
                className="h-11 w-11 rounded-lg bg-white object-contain p-0.5 shadow-sm"
              />
              <span className="hidden sm:inline">Slovenská speleologická spoločnosť</span>
            </a>

            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {resourceLinks.map(({ href, label, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Otvoriť ${label} v novom okne`}
                  title={label}
                  className="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-md border border-[#3a424d] px-2.5 text-[#c8cfd8] transition-colors hover:border-[#fbbc05] hover:text-[#fbbc05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbbc05]"
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="hidden text-xs font-medium sm:inline">{label}</span>
                </a>
              ))}
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => void submitLogout()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#3a424d] px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-[#fbbc05] hover:text-[#fbbc05]"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  Odhlásiť
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openLogin}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#3a424d] px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-[#fbbc05] hover:text-[#fbbc05]"
                >
                  <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                  Prihlásenie admina
                </button>
              )}
              <button
                type="button"
                onClick={onExportClick}
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#fbbc05] px-3 py-2 text-xs font-semibold text-[#1a1e23] whitespace-nowrap transition-colors hover:bg-[#eab004] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbbc05]"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Export PDF
              </button>
            </div>
          </div>

          <nav
            aria-label="Hlavná navigácia"
            className="mt-2 flex gap-1 overflow-x-auto pb-0.5 text-xs font-medium text-[#c8cfd8] sm:gap-2"
          >
            {links.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                aria-current={activeView === link.id ? 'page' : undefined}
                className={`min-h-11 shrink-0 rounded-md px-3 py-3 transition-colors hover:text-[#fbbc05] ${
                  activeView === link.id ? 'bg-[#2a3038] text-[#fbbc05]' : ''
                }`}
              >
                {link.label}
              </a>
            ))}
          </nav>
          {authError && !isLoginOpen && (
            <p role="status" className="mt-2 text-xs text-[#ff9e75]">
              {authError}
            </p>
          )}
        </div>
      </header>

      <dialog
        ref={loginDialogRef}
        aria-labelledby="admin-login-title"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const focusableElements = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ].filter((element) => element.getClientRects().length > 0);
          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (!firstElement || !lastElement) return;
          if (event.shiftKey && document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          } else if (!event.shiftKey && document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }}
        onCancel={(event) => {
          event.preventDefault();
          setIsLoginOpen(false);
        }}
        onClose={() => {
          if (isLoginOpen) setIsLoginOpen(false);
        }}
        className="m-auto max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border-0 bg-white p-6 shadow-2xl backdrop:bg-black/60"
      >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#c13100]">
                  Administrácia
                </p>
                <h2 id="admin-login-title" className="mt-1 font-display text-xl font-bold text-[#1a1e23]">
                  Prihlásenie
                </h2>
              </div>
              <button
                type="button"
                aria-label="Zavrieť prihlasovacie okno"
                onClick={() => setIsLoginOpen(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-[#5a6370] transition-colors hover:bg-[#f4f5f7] hover:text-[#1a1e23] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1e23]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={(event) => void submitLogin(event)} className="mt-5 space-y-4">
              <label className="block text-xs font-semibold text-[#343c47]">
                Prihlasovacie meno
                <input
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="mt-1.5 min-h-11 w-full rounded-lg border border-[#d5d9e0] px-3 py-2 text-sm text-[#1a1e23] outline-none focus:border-[#1a1e23]"
                />
              </label>
              <label className="block text-xs font-semibold text-[#343c47]">
                Heslo
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1.5 min-h-11 w-full rounded-lg border border-[#d5d9e0] px-3 py-2 text-sm text-[#1a1e23] outline-none focus:border-[#1a1e23]"
                />
              </label>
              {authError && (
                <p role="alert" className="text-xs text-[#c13100]">
                  {authError}
                </p>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="min-h-11 w-full rounded-lg bg-[#1a1e23] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2a3038] disabled:opacity-50"
              >
                {isSubmitting ? 'Prihlasujem…' : 'Prihlásiť sa'}
              </button>
            </form>
      </dialog>
    </>
  );
};
