import type { Reward } from '../db/types';

export const REWARD_ICONS: { key: Reward['icon']; label: string; path: React.ReactNode }[] = [
  {
    key: 'regalo',
    label: 'Regalo',
    path: (
      <>
        <rect x="3" y="8" width="18" height="13" rx="2" />
        <path d="M12 8v13M3 12h18M12 8C10 4 6 4 6 7s4 1 6 1zM12 8c2-4 6-4 6-1s-4 1-6 1z" />
      </>
    ),
  },
  {
    key: 'cuore',
    label: 'Cuore',
    path: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  },
  {
    key: 'film',
    label: 'Film',
    path: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 5v14M17 5v14M3 10h4M3 14h4M17 10h4M17 14h4" />
      </>
    ),
  },
  {
    key: 'tazza',
    label: 'Tazza',
    path: (
      <path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 11h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3" />
    ),
  },
  {
    key: 'stella',
    label: 'Stella',
    path: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  },
];

export function RewardIcon({ icon, size = 22 }: { icon: Reward['icon']; size?: number }) {
  const def = REWARD_ICONS.find((i) => i.key === icon) ?? REWARD_ICONS[0];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#4A3612"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {def.path}
    </svg>
  );
}
