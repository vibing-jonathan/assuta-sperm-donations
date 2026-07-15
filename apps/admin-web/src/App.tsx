import './App.css'

import { AuthGate } from './components/AuthGate'
import { supabase } from './lib/supabase'

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
          <h2 id="foundation-title">האימות פעיל</h2>
          <p>ניהול תורמים וייבוא קובצי PDF יתווספו בשלבים הבאים.</p>
        </div>
        <span className="status-badge">מנהל מורשה</span>
      </section>
    </main>
  )
}

function App() {
  return (
    <AuthGate>
      {(principal) => (
        <AdminDashboard
          email={principal.email}
          onSignOut={async () => {
            await supabase?.auth.signOut()
          }}
        />
      )}
    </AuthGate>
  )
}

export default App
