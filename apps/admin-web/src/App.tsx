import './App.css'

function App() {
  return (
    <main className="app-shell" dir="rtl">
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
          <h2 id="foundation-title">תשתית הפרויקט מוכנה</h2>
          <p>
            אימות מנהלים, ניהול תורמים וייבוא קובצי PDF יתווספו בשלבים הבאים.
          </p>
        </div>
        <span className="status-badge">בפיתוח</span>
      </section>
    </main>
  )
}

export default App
