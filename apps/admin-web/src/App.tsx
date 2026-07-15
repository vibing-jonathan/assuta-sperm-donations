import { signOut } from 'firebase/auth'

import './App.css'

import { AuthGate } from './components/AuthGate'
import { DonorManagement } from './features/donors/DonorManagement'
import type { DonorRepository } from './features/donors/donorRepository'
import { auth } from './lib/firebase'

interface AdminDashboardProps {
  email: string
  onSignOut: () => void | Promise<void>
  donorRepository?: DonorRepository
}

export function AdminDashboard({ email, onSignOut, donorRepository }: AdminDashboardProps) {
  return (
    <div className="admin-layout" dir="rtl">
      <aside className="sidebar">
        <div>
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">✚</span>
            <div><strong>מערכת ניהול תורמים</strong><span>ניהול קליני</span></div>
          </div>
          <nav className="primary-nav" aria-label="ניווט ראשי">
            <a className="active" href="#donors" aria-current="page"><span aria-hidden="true">◉</span> תורמים</a>
            <button type="button" disabled title="ייבוא קבצים יתווסף בשלב הבא"><span aria-hidden="true">⇧</span> ייבוא קבצים</button>
            <button type="button" disabled title="הגדרות יתווספו בהמשך"><span aria-hidden="true">⚙</span> הגדרות</button>
          </nav>
        </div>
        <div className="account-panel">
          <span className="account-email" dir="ltr">{email}</span>
          <button type="button" onClick={() => void onSignOut()}><span aria-hidden="true">↪</span> יציאה</button>
        </div>
      </aside>
      <main className="app-shell" id="donors">
        <DonorManagement adminEmail={email} repository={donorRepository} />
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
