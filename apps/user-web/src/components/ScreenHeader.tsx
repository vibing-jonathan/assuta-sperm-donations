import type { ReactNode } from 'react'

import { Icon } from './Icon'

interface ScreenHeaderProps {
  title: string
  onBack?: () => void
  action?: ReactNode
  dark?: boolean
}

export function ScreenHeader({ title, onBack, action, dark = false }: ScreenHeaderProps) {
  return (
    <header className={`screen-header${dark ? ' screen-header-dark' : ''}`}>
      {onBack
        ? <button className="icon-button" type="button" onClick={onBack} aria-label="חזרה"><Icon name="arrow" /></button>
        : <span />}
      <h1>{title}</h1>
      {action ?? <span />}
    </header>
  )
}
