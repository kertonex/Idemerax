import type { ReactNode } from 'react';

export type AppIconName =
  | 'dashboard'
  | 'accounts'
  | 'cards'
  | 'transactions'
  | 'settings'
  | 'user'
  | 'wallet'
  | 'activity'
  | 'coffee'
  | 'gift'
  | 'briefcase'
  | 'arrow-right'
  | 'arrow-up-right'
  | 'arrow-down-left'
  | 'log-out'
  | 'chevron-right'
  | 'menu';

interface AppIconProps {
  name: AppIconName;
  className?: string;
  strokeWidth?: number;
}

const iconArtwork: Record<AppIconName, ReactNode> = {
  dashboard: (
    <>
      <path d="m3.5 10 8.5-7 8.5 7" />
      <path d="M5.5 9v11h13V9M9 20v-6h6v6" />
    </>
  ),
  accounts: (
    <>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5 10v9m4-9v9m6-9v9m4-9v9M3 20h18M2.5 22h19" />
    </>
  ),
  cards: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3.5 9.5h17M7 15h3" />
    </>
  ),
  transactions: (
    <>
      <path d="M7 7h13l-3-3m3 3-3 3M17 17H4l3 3m-3-3 3-3" />
    </>
  ),
  settings: (
    <>
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
      <path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3h-.2a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 0 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.8 1.8 0 0 0-.9 3Z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c.8-3.2 3.5-5 7.5-5s6.7 1.8 7.5 5" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 6.5h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13" />
      <path d="M3 8h14.5M15.5 13h5M17 13v.1" />
    </>
  ),
  activity: (
    <>
      <path d="M3 12h4l2.2-6 4.1 12 2.2-6H21" />
    </>
  ),
  coffee: (
    <>
      <path d="M5 8h12v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8Z" />
      <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v2m4-2v2m4-2v2" />
    </>
  ),
  gift: (
    <>
      <path d="M3 10h18v11H3zM2 6h20v4H2zM12 6v15" />
      <path d="M12 6H8.5a2.5 2.5 0 1 1 2.5-2.5V6Zm0 0h3.5a2.5 2.5 0 1 0-2.5-2.5V6Z" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18m-11 0v2h4v-2" />
    </>
  ),
  'arrow-right': <path d="M4 12h16m-6-6 6 6-6 6" />,
  'arrow-up-right': <path d="M7 17 17 7M8 7h9v9" />,
  'arrow-down-left': <path d="M17 7 7 17m9 0H7V8" />,
  'log-out': (
    <>
      <path d="M10 17l5-5-5-5m5 5H3" />
      <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
    </>
  ),
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
};

function AppIcon({
  name,
  className = 'h-5 w-5',
  strokeWidth = 1.8,
}: AppIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
    >
      {iconArtwork[name]}
    </svg>
  );
}

export default AppIcon;
