export type IconName =
  | 'arrow'
  | 'check'
  | 'document'
  | 'download'
  | 'eye'
  | 'eyeOff'
  | 'info'
  | 'lock'
  | 'logout'
  | 'minus'
  | 'open'
  | 'plus'
  | 'refresh'

interface IconProps {
  name: IconName
  className?: string
}

export function Icon({ name, className }: IconProps) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <path d="m9 5 7 7-7 7" />,
    check: <path d="m5 12.5 4.2 4L19 7" />,
    document: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h4M10 12h5M10 16h5" /></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 18v3h14v-3" /></>,
    eye: <><path d="M2.5 12s3.5-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.5 5.5-9.5 5.5S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.5" /></>,
    eyeOff: <><path d="m3 3 18 18M10.6 6.7A10.7 10.7 0 0 1 12 6.5c6 0 9.5 5.5 9.5 5.5a16 16 0 0 1-2.3 2.8M6.4 6.5C3.9 8.2 2.5 12 2.5 12s3.5 5.5 9.5 5.5a10 10 0 0 0 4-.8M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4m4-4H9" /></>,
    minus: <path d="M5 12h14" />,
    open: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    refresh: <><path d="M20 7v5h-5" /><path d="M18.2 16A8 8 0 1 1 20 12" /></>,
  }

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 36 36" fill="none">
        <path d="M8 18c0-6 4.1-10 10-10s10 4 10 10-4.1 10-10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="18" cy="18" r="3.5" fill="currentColor" />
        <path className="brand-mark-accent" d="M18 28A10 10 0 0 1 8 18" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  )
}
