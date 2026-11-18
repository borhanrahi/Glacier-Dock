/**
 * Custom-built Glacier Dock duotone glass icons:
 * Layered translucent frosted backplates + Aurora/ice gradients + crisp
 * specular highlights crafted specifically for Glacier's liquid-glass UI.
 */

export function StartGridIcon({ className = "size-full" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id="gl-aurora" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#A5F3FC" />
          <stop offset="50%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>
        <linearGradient id="gl-frost" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="8" height="8" rx="2.4" fill="url(#gl-aurora)" />
      <rect x="13" y="3" width="8" height="8" rx="2.4" fill="url(#gl-aurora)" opacity="0.82" />
      <rect x="3" y="13" width="8" height="8" rx="2.4" fill="url(#gl-aurora)" opacity="0.82" />
      <rect x="13" y="13" width="8" height="8" rx="2.4" fill="url(#gl-frost)" stroke="url(#gl-aurora)" strokeWidth="1.2" />
    </svg>
  );
}

export function ActivityMonitorIcon({ className = "size-full" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id="gl-act-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#0F172A" stopOpacity="0.45" />
        </linearGradient>
        <linearGradient id="gl-act-wave" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5EEAD4" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <rect
        x="2.75"
        y="4"
        width="18.5"
        height="16"
        rx="4"
        fill="url(#gl-act-bg)"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="1.2"
      />
      <path
        d="M5 13h3.2l2.1-4.8 3.2 7.6 2.2-4.3H19"
        fill="none"
        stroke="url(#gl-act-wave)"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="11.5" r="1.4" fill="#5EEAD4" />
    </svg>
  );
}

export function SettingsGearIcon({ className = "size-full" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id="gl-gear-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F8FAFC" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#94A3B8" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="gl-gear-core" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5EEAD4" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <path
        d="M10.3 2.7a1.8 1.8 0 0 1 3.4 0l.3 1.1a1.5 1.5 0 0 0 2.1.9l1-.5a1.8 1.8 0 0 1 2.4 2.4l-.5 1a1.5 1.5 0 0 0 .9 2.1l1.1.3a1.8 1.8 0 0 1 0 3.4l-1.1.3a1.5 1.5 0 0 0-.9 2.1l.5 1a1.8 1.8 0 0 1-2.4 2.4l-1-.5a1.5 1.5 0 0 0-2.1.9l-.3 1.1a1.8 1.8 0 0 1-3.4 0l-.3-1.1a1.5 1.5 0 0 0-2.1-.9l-1 .5a1.8 1.8 0 0 1-2.4-2.4l.5-1a1.5 1.5 0 0 0-.9-2.1l-1.1-.3a1.8 1.8 0 0 1 0-3.4l1.1-.3a1.5 1.5 0 0 0 .9-2.1l-.5-1a1.8 1.8 0 0 1 2.4-2.4l1 .5a1.5 1.5 0 0 0 2.1-.9l.3-1.1Z"
        fill="url(#gl-gear-body)"
        stroke="rgba(255,255,255,0.38)"
        strokeWidth="1"
      />
      <circle cx="12" cy="12" r="4" fill="#0F172A" fillOpacity="0.72" stroke="url(#gl-gear-core)" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="1.4" fill="url(#gl-gear-core)" />
    </svg>
  );
}

export function SpotlightSearchIcon({ className = "size-full" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id="gl-lens" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#A5F3FC" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id="gl-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E0F2FE" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <circle cx="10.5" cy="10.5" r="6.5" fill="url(#gl-lens)" stroke="url(#gl-rim)" strokeWidth="1.8" />
      <path d="M7.5 8.5a4 4 0 0 1 4-2.2" fill="none" stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M15.4 15.4 20 20" fill="none" stroke="url(#gl-rim)" strokeWidth="2.3" strokeLinecap="round" />
    </svg>
  );
}

export function DownloadsIcon({ className = "size-full" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id="gl-dl-tray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id="gl-dl-arrow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A5F3FC" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <rect
        x="3.5"
        y="13.5"
        width="17"
        height="7"
        rx="2.5"
        fill="url(#gl-dl-tray)"
        stroke="rgba(255,255,255,0.32)"
        strokeWidth="1.2"
      />
      <path
        d="M12 3.5v10.5m0 0-3.8-3.8M12 14l3.8-3.8"
        fill="none"
        stroke="url(#gl-dl-arrow)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrashBinIcon({ className = "size-full" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id="gl-trash-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F1F5F9" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#94A3B8" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <path
        d="M9.5 4h5a1 1 0 0 1 1 1v1h-7V5a1 1 0 0 1 1-1Z"
        fill="rgba(255,255,255,0.45)"
      />
      <rect x="4.5" y="6" width="15" height="2.2" rx="1.1" fill="rgba(255,255,255,0.72)" />
      <path
        d="M6.2 8.5h11.6l-.9 10.7a2.2 2.2 0 0 1-2.2 2H9.3a2.2 2.2 0 0 1-2.2-2L6.2 8.5Z"
        fill="url(#gl-trash-glass)"
        stroke="rgba(255,255,255,0.34)"
        strokeWidth="1.2"
      />
      <path d="M10 11.5v6.5M14 11.5v6.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronTrayIcon({ className = "size-full" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} opacity-85`} aria-hidden>
      <path
        d="M6.5 14.5 12 9l5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
