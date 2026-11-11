import { replace } from '../lib/router';

type Tab = 'home' | 'calendario' | 'quiz' | 'premi';

const ICONS: Record<Tab, React.ReactNode> = {
  home: (
    <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" strokeLinejoin="round" />
  ),
  calendario: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  quiz: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" strokeLinecap="round" />
    </>
  ),
  premi: (
    <>
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path
        d="M12 8v13M3 12h18M12 8C10 4 6 4 6 7s4 1 6 1zM12 8c2-4 6-4 6-1s-4 1-6 1z"
        strokeLinejoin="round"
      />
    </>
  ),
};
const LABELS: Record<Tab, string> = {
  home: 'Home',
  calendario: 'Calendario',
  quiz: 'Quiz',
  premi: 'Premi',
};
const HREF: Record<Tab, string> = {
  home: '#/',
  calendario: '#/calendario',
  quiz: '#/quiz',
  premi: '#/premi',
};

export function BottomNav({ active }: { active: Tab }) {
  return (
    <nav className="bottom-nav" aria-label="Navigazione">
      {(Object.keys(ICONS) as Tab[]).map((t) => (
        <a
          key={t}
          href={HREF[t]}
          aria-label={LABELS[t]}
          aria-current={t === active ? 'page' : undefined}
          className={t === active ? 'on' : ''}
          onClick={(e) => {
            // trocar de aba SUBSTITUI a entrada do histórico (não empilha); Ctrl/Cmd+clique abre em outra aba
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            replace(HREF[t].slice(1));
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            {ICONS[t]}
          </svg>
        </a>
      ))}
    </nav>
  );
}
