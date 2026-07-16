import { signOut } from 'firebase/auth'
import { useState } from 'react'

import './App.css'

import { AuthGate } from './components/AuthGate'
import { DonorManagement } from './features/donors/DonorManagement'
import type { DonorRepository } from './features/donors/donorRepository'
import { PdfImport, type PdfImportProps } from './features/imports/PdfImport'
import { auth } from './lib/firebase'

interface AdminDashboardProps {
  email: string
  onSignOut: () => void | Promise<void>
  donorRepository?: DonorRepository
  pdfImportProps?: Partial<Pick<PdfImportProps, 'repository' | 'scanPdf' | 'extractPdf'>>
}

export function AdminDashboard({ email, onSignOut, donorRepository, pdfImportProps }: AdminDashboardProps) {
  const [activePage, setActivePage] = useState<'donors' | 'import'>('donors')
  const [importOperationActive, setImportOperationActive] = useState(false)

  function navigateTo(page: 'donors' | 'import') {
    if (importOperationActive) return
    setActivePage(page)
  }

  return (
    <div className="admin-layout" dir="rtl">
      <aside className="sidebar">
        <div>
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">✚</span>
            <div><strong>מערכת ניהול תורמים</strong><span>ניהול קליני</span></div>
          </div>
          <nav className="primary-nav" aria-label="ניווט ראשי">
            <button className={activePage === 'donors' ? 'active' : undefined} type="button" disabled={importOperationActive} aria-current={activePage === 'donors' ? 'page' : undefined} onClick={() => navigateTo('donors')}><span aria-hidden="true">◉</span> תורמים</button>
            <button className={activePage === 'import' ? 'active' : undefined} type="button" disabled={importOperationActive} aria-current={activePage === 'import' ? 'page' : undefined} onClick={() => navigateTo('import')}><span aria-hidden="true">⇧</span> ייבוא קבצים</button>
            <button type="button" disabled title="הגדרות יתווספו בהמשך"><span aria-hidden="true">⚙</span> הגדרות</button>
          </nav>
        </div>
        <div className="account-panel">
          <span className="account-email" dir="ltr">{email}</span>
          <button type="button" disabled={importOperationActive} onClick={() => void onSignOut()}><span aria-hidden="true">↪</span> יציאה</button>
        </div>
      </aside>
      <main className="app-shell" id={activePage}>
        {activePage === 'donors'
          ? <DonorManagement adminEmail={email} repository={donorRepository} />
          : (
            <PdfImport
              adminEmail={email}
              onNavigateToDonors={() => navigateTo('donors')}
              onActiveOperationChange={setImportOperationActive}
              {...pdfImportProps}
            />
          )}
      </main>
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
