import { signOut } from 'firebase/auth'
import { useState } from 'react'

import './App.css'

import { AuthGate } from './components/AuthGate'
import { DonorManagement } from './features/donors/DonorManagement'
import type { DonorRepository } from './features/donors/donorRepository'
import { PdfImport, type PdfImportProps } from './features/imports/PdfImport'
import { UserAccessSettings } from './features/settings/UserAccessSettings'
import type { UserAccessRepository } from './features/settings/userAccessRepository'
import { auth } from './lib/firebase'

type AdminPage = 'donors' | 'import' | 'settings'

interface AdminDashboardProps {
  email: string
  onSignOut: () => void | Promise<void>
  donorRepository?: DonorRepository
  pdfImportProps?: Partial<Pick<PdfImportProps, 'repository' | 'scanPdf' | 'extractPdf' | 'storePages'>>
  userAccessRepository?: UserAccessRepository
}

export function AdminDashboard({ email, onSignOut, donorRepository, pdfImportProps, userAccessRepository }: AdminDashboardProps) {
  const [activePage, setActivePage] = useState<AdminPage>('donors')
  const [importOperationActive, setImportOperationActive] = useState(false)

  function navigateTo(page: AdminPage) {
    if (importOperationActive) return
    setActivePage(page)
  }

  return (
    <div className="admin-layout" dir="rtl">
      <header className="mobile-topbar">
        <div className="mobile-topbar-brand"><span className="brand-mark" aria-hidden="true">✚</span><strong>מערכת קלינית</strong></div>
        <button className="mobile-signout" type="button" disabled={importOperationActive} aria-label="יציאה מהמערכת" onClick={() => void onSignOut()}>↪</button>
      </header>
      <aside className="sidebar">
        <div>
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">✚</span>
            <div><strong>מערכת ניהול תורמים</strong><span>ניהול קליני</span></div>
          </div>
          <nav className="primary-nav" aria-label="ניווט ראשי">
            <button className={activePage === 'donors' ? 'active' : undefined} type="button" disabled={importOperationActive} aria-current={activePage === 'donors' ? 'page' : undefined} onClick={() => navigateTo('donors')}><span aria-hidden="true">◉</span> תורמים</button>
            <button className={activePage === 'import' ? 'active' : undefined} type="button" disabled={importOperationActive} aria-current={activePage === 'import' ? 'page' : undefined} onClick={() => navigateTo('import')}><span aria-hidden="true">⇧</span> ייבוא קבצים</button>
            <button className={activePage === 'settings' ? 'active' : undefined} type="button" disabled={importOperationActive} aria-current={activePage === 'settings' ? 'page' : undefined} onClick={() => navigateTo('settings')}><span aria-hidden="true">⚙</span> הגדרות</button>
          </nav>
        </div>
        <div className="account-panel">
          <span className="account-email" dir="ltr">{email}</span>
          <button type="button" disabled={importOperationActive} onClick={() => void onSignOut()}><span aria-hidden="true">↪</span> יציאה</button>
        </div>
      </aside>
      <main className="app-shell" id={activePage}>
        {activePage === 'donors' && <DonorManagement adminEmail={email} repository={donorRepository} />}
        {activePage === 'import' && (
            <PdfImport
              adminEmail={email}
              onNavigateToDonors={() => navigateTo('donors')}
              onActiveOperationChange={setImportOperationActive}
              {...pdfImportProps}
            />
          )}
        {activePage === 'settings' && <UserAccessSettings adminEmail={email} repository={userAccessRepository} />}
      </main>
      <nav className="mobile-bottom-nav" aria-label="ניווט ראשי לנייד">
        <button className={activePage === 'donors' ? 'active' : undefined} type="button" disabled={importOperationActive} aria-current={activePage === 'donors' ? 'page' : undefined} onClick={() => navigateTo('donors')}><span aria-hidden="true">♙</span><small>תורמים</small></button>
        <button className={activePage === 'import' ? 'active' : undefined} type="button" disabled={importOperationActive} aria-current={activePage === 'import' ? 'page' : undefined} onClick={() => navigateTo('import')}><span aria-hidden="true">▧</span><small>ייבוא קובץ</small></button>
        <button className={activePage === 'settings' ? 'active' : undefined} type="button" disabled={importOperationActive} aria-current={activePage === 'settings' ? 'page' : undefined} onClick={() => navigateTo('settings')}><span aria-hidden="true">⚙</span><small>הגדרות</small></button>
      </nav>
    </div>
  )
}

function App() {
  return (
    <AuthGate>
      {(user) => <AdminDashboard email={user.email ?? ''} onSignOut={() => signOut(auth)} />}
    </AuthGate>
  )
}

export default App
