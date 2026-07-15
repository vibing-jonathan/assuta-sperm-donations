import { signOut } from 'firebase/auth'

import './App.css'

import { AuthGate } from './components/AuthGate'
import { auth } from './lib/firebase'

interface AdminDashboardProps {
  email: string
  onSignOut: () => void | Promise<void>
}

export function AdminDashboard({ email, onSignOut }: AdminDashboardProps) {
  return (
    <main className="app-shell" dir="rtl">
      <nav className="account-bar" aria-label="חשבון מנהל">
        <span>{email}</span>
        <button className="text-button" type="button" onClick={() => void onSignOut()}>
          יציאה
        </button>
      </nav>

      <header className="app-header">
        <p className="app-eyebrow">מערכת אדמיניסטרטיבית</p>
        <h1>ניהול תורמי זרע</h1>
        <p className="app-subtitle">
          סביבת עבודה מאובטחת לניהול תורמים וייבוא נתונים.
        </p>
      </header>

      <section className="status-card" aria-labelledby="foundation-title">
        <div>
          <p className="status-label">מצב המערכת</p>
          <h2 id="foundation-title">Firebase מחובר</h2>
          <p>האימות ו-Firestore מוכנים. ניהול התורמים יתווסף בשלב הבא.</p>
        </div>
        <span className="status-badge">מנהל מורשה</span>
      </section>
    </main>
  )
}

function App() {
  return (
    <AuthGate>
      {(user) => (
        <AdminDashboard email={user.email ?? ''} onSignOut={() => signOut(auth)} />
      )}
    </AuthGate>
  )
}

export default App
