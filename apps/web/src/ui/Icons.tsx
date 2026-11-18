import type { ReactNode } from 'react';

const paths = {
  monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 21h8m-4-5v5" /></>,
  laptop: <path d="M5 16V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v11M3 16h18l1 3H2l1-3Z" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  upload: <path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" />,
  download: <path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4" />,
  file: <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Zm0 0v5h5M9 13h6m-6 4h4" />,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  edit: <path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z" />,
  shield: <><path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5l8-3Z" /><path d="m8 11 3 3 5-5" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5.8-1.5 1.3-1.5 2M12 17h.01" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2" /></>,
  folder: <path d="M3 7V4h7l2 3h9v13H3V7Z" />,
  link: <path d="m10 14 4-4m-5 6-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m3 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0) scale(.92)" />,
  alert: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3h.01" /></>,
} satisfies Record<string, ReactNode>;

export function Icon({ name, size = '', className = '' }: { name: keyof typeof paths; size?: 'sm' | 'lg' | ''; className?: string }) {
  return <svg className={`icon ${size} ${className}`} viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function Brand() {
  return <div className="brand">
    <div className="brand-logo"><svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M4 9h16m-4-4 4 4-4 4M22 17H6m4-4-4 4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg></div>
    <div><div className="brand-title">局域网快传</div><div className="brand-sub">LAN SEND</div></div>
  </div>;
}
