import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'

import './styles.css'

import { DonorImage } from './components/DonorImage'
import { BrandMark, Icon } from './components/Icon'
import { PdfViewer } from './components/PdfViewer'
import { ScreenHeader } from './components/ScreenHeader'
import {
  firebaseUserAccessService,
  loginErrorMessage,
  type UserAccessService,
  type UserSessionState,
} from './features/auth/userAccess'
import { donorDisplayNumber, isCarrierFree, type Donor } from './features/donors/donor'
import { firebaseDonorRepository, type DonorRepository } from './features/donors/donorRepository'
import { firebaseDonorMediaRepository, type DonorMediaRepository } from './features/donors/mediaRepository'
import { ANY_OPTION, rankClosestDonors, type PreferenceAnswers } from './features/matching/matching'
import { buildQuestions } from './features/matching/questions'

type AppScreen = 'welcome' | 'questions' | 'results' | 'detail' | 'pdf'
type DonorLoadState = 'idle' | 'loading' | 'ready' | 'error'

export interface AppProps {
  accessService?: UserAccessService
  donorRepository?: DonorRepository
  mediaRepository?: DonorMediaRepository
}

function PublicSiteFrame({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <footer className="site-footer" dir="rtl">
        <a className="site-footer-logo" href="https://superm.assuta.co.il/" target="_blank" rel="noreferrer" aria-label="מעבר לאתר Assuta Superm">
          <img src="/assuta-superm-logo.png" alt="לוגו Assuta Superm" />
        </a>
        <span>בשיתוף פעולה עם Assuta Superm</span>
      </footer>
    </>
  )
}

type LegalDocument = 'privacy' | 'terms'

function PrivacyPolicyContent() {
  return (
    <>
      <p className="legal-updated">עודכן לאחרונה: 20 ביולי 2026</p>
      <section>
        <h3>1. כללי</h3>
        <p>מדיניות זו מסבירה כיצד נעשה שימוש במידע במסגרת מערכת התאמת התורמים (״השירות״). השירות מיועד למשתמשות מורשות בלבד ומופעל לצורך סיוע בתהליך עיון והשוואה בין פרופילי תורמים.</p>
      </section>
      <section>
        <h3>2. המידע המעובד בשירות</h3>
        <ul>
          <li><strong>פרטי התחברות:</strong> שם המשתמש והסיסמה נשלחים לצורך אימות והרשאה. הסיסמה אינה נשמרת על גבי המכשיר שלך.</li>
          <li><strong>נתוני הפעלה ואבטחה:</strong> בעת השימוש עשויים להיווצר נתונים טכניים הנדרשים להפעלת השירות, כגון כתובת IP, סוג דפדפן, מועדי גישה ורישומי שגיאות ואבטחה.</li>
          <li><strong>העדפות התאמה:</strong> התשובות שתבחרי לשאלון משמשות לחישוב הדירוג במכשיר ובמהלך השימוש הנוכחי. הן אינן נשמרות בפרופיל משתמש אישי.</li>
          <li><strong>מידע על תורמים:</strong> השירות מציג מידע שנמסר למפעילי המערכת לצורך הליך ההתאמה. מידע זה מיועד לעיון מורשה בלבד.</li>
        </ul>
      </section>
      <section>
        <h3>3. מטרות השימוש במידע</h3>
        <p>המידע משמש לאימות הרשאה, הצגת פרופילי תורמים, דירוג התאמות לפי בחירותייך, אבטחת השירות, איתור תקלות, מניעת שימוש לרעה ועמידה בדרישות הדין.</p>
      </section>
      <section>
        <h3>4. שמירה מקומית, עוגיות וכלי מדידה</h3>
        <p>השירות שומר מידע מקומי הכרחי לניהול סשן ההתחברות. סשן זה מיועד להסתיים בעת יציאה יזומה או בסיום סשן הדפדפן. בגרסה הנוכחית לא מופעלים כלי פרסום או ניתוח שימוש יזומים.</p>
      </section>
      <section>
        <h3>5. ספקי שירות ועיבוד מחוץ לישראל</h3>
        <p>לצורך הפעלת השירות נעשה שימוש בשירותי Firebase ו-Google Cloud, לרבות אימות, אחסון, מסד נתונים, אירוח ופונקציות ענן. מידע עשוי להיות מעובד או מאוחסן מחוץ לישראל בהתאם לשירות ולתצורתו, בכפוף להסדרים החלים על ספקי השירות.</p>
      </section>
      <section>
        <h3>6. שמירת מידע ואבטחתו</h3>
        <p>מידע נשמר רק למשך הזמן הדרוש למטרות השירות, לצורכי אבטחה ובהתאם לחובות החלות על מפעילי המערכת. ננקטים אמצעים סבירים להגנת המידע, אך אין מערכת מקוונת החסינה לחלוטין מפני סיכונים.</p>
      </section>
      <section>
        <h3>7. זכויות ופניות</h3>
        <p>בכפוף לדין, ניתן לבקש לעיין במידע אישי המוחזק לגבייך ולבקש לתקנו אם אינו נכון, שלם, ברור או מעודכן. לפניות בנושא פרטיות יש לפנות לצוות המרפאה, אשר יעביר את הבקשה לגורם המתאים.</p>
      </section>
      <section>
        <h3>8. עדכונים למדיניות</h3>
        <p>מדיניות זו עשויה להתעדכן בהתאם לשינויים בשירות או בדין. נוסח מעודכן יוצג במערכת ויישא את מועד העדכון האחרון.</p>
      </section>
    </>
  )
}

function TermsOfServiceContent() {
  return (
    <>
      <p className="legal-updated">עודכן לאחרונה: 20 ביולי 2026</p>
      <section>
        <h3>1. קבלת התנאים</h3>
        <p>הכניסה לשירות והשימוש בו כפופים לתנאי שימוש אלה ולמדיניות הפרטיות. סימון תיבת האישור ולחיצה על ״כניסה״ מהווים אישור לכך שקראת את המסמכים והסכמת להם.</p>
      </section>
      <section>
        <h3>2. הרשאה לשימוש</h3>
        <p>השירות מיועד למשתמשות שקיבלו הרשאה מצוות המרפאה. ההרשאה אישית ומוגבלת למטרת עיון והשוואה במסגרת תהליך בחירת תורם. אין להעביר את פרטי ההתחברות, לאפשר גישה לאחרת או להשתמש בשירות לכל מטרה אחרת.</p>
      </section>
      <section>
        <h3>3. כלי עזר בלבד — לא ייעוץ רפואי</h3>
        <p>הדירוגים וההתאמות מבוססים על הבחירות שסימנת ועל המידע הזמין במערכת. הם כלי עזר להשוואה בלבד ואינם המלצה רפואית, גנטית או מקצועית. לפני קבלת החלטה יש לעיין במסמכי התורם ולהיוועץ בצוות הרפואי.</p>
      </section>
      <section>
        <h3>4. תמונות שנוצרו באמצעות בינה מלאכותית</h3>
        <p>תמונות פרופיל המסומנות בתג ״AI״ הן המחשות סינתטיות שנוצרו באמצעות בינה מלאכותית. הן אינן צילום של התורם, אינן מבטיחות דמיון למראהו ואינן מיועדות לשמש בסיס להחלטה רפואית או לזיהוי.</p>
      </section>
      <section>
        <h3>5. שימוש מותר ואסור</h3>
        <p>אין להעתיק, לצלם, להוריד, לפרסם, להעביר או לחשוף מידע על תורמים שלא לצורך המורשה; אין לנסות לעקוף מנגנוני אבטחה, לבצע שאיבה אוטומטית של מידע, להפריע לפעולת השירות או להשתמש בו באופן הפוגע בפרטיות, בסודיות או בזכויות של אחרות ואחרים.</p>
      </section>
      <section>
        <h3>6. דיוק וזמינות</h3>
        <p>נעשה מאמץ להציג מידע מדויק ועדכני, אך ייתכנו טעויות, פערים או שינויים בזמינות התורמים. במקרה של סתירה, המסמכים המקוריים והמידע המאומת בידי צוות המרפאה הם הקובעים. השירות עשוי להשתנות, להיקטע או להיות מושבת לצורכי תחזוקה ואבטחה.</p>
      </section>
      <section>
        <h3>7. קישורים חיצוניים</h3>
        <p>השירות עשוי לכלול קישור לאתר Assuta Superm. השימוש באתר חיצוני כפוף לתנאים ולמדיניות הפרטיות של אותו אתר, ואינו בשליטת שירות התאמת התורמים.</p>
      </section>
      <section>
        <h3>8. אחריות</h3>
        <p>השימוש בשירות הוא באחריותך ובכפוף לכל דין. מפעילי השירות אינם מתחייבים כי השירות יהיה זמין ללא הפרעה או נקי מכל טעות, ואינם מחליפים את שיקול הדעת והליווי של הצוות הרפואי.</p>
      </section>
      <section>
        <h3>9. שינוי או הפסקת גישה</h3>
        <p>מפעילי השירות רשאים לעדכן את השירות או תנאים אלה, וכן להגביל או להפסיק גישה במקרה של שימוש בלתי מורשה, סיכון אבטחה או הפרת התנאים. הדין הישראלי יחול על השימוש בשירות.</p>
      </section>
    </>
  )
}

function LegalDialog({ kind, onClose }: { kind: LegalDocument, onClose: () => void }) {
  const isPrivacy = kind === 'privacy'
  const title = isPrivacy ? 'מדיניות פרטיות' : 'תנאי שימוש'

  useEffect(() => {
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="legal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="legal-dialog" role="dialog" aria-modal="true" aria-labelledby={`legal-title-${kind}`} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span>Assuta Superm</span>
            <h2 id={`legal-title-${kind}`}>{title}</h2>
          </div>
          <button type="button" autoFocus onClick={onClose} aria-label={`סגירת ${title}`}>×</button>
        </header>
        <div className="legal-content">
          {isPrivacy ? <PrivacyPolicyContent /> : <TermsOfServiceContent />}
        </div>
      </section>
    </div>
  )
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="app-shell" dir="rtl">
      <section className="screen centered-state" role="status">
        <div className="brand"><BrandMark /><span>התאמה</span></div>
        <span className="spinner spinner-accent" />
        <p>{message}</p>
      </section>
    </main>
  )
}

function LoginScreen({ service }: { service: UserAccessService }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [openLegalDocument, setOpenLegalDocument] = useState<LegalDocument | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await service.login({ username, password })
    } catch (reason) {
      setError(loginErrorMessage(reason))
      setSubmitting(false)
    }
  }

  return (
    <main className="app-shell" dir="rtl">
      <section className="screen login-screen">
        <div className="login-top">
          <div className="brand"><BrandMark /><span>התאמה</span></div>
          <span className="private-label">מרחב פרטי</span>
        </div>
        <div className="login-content">
          <p className="eyebrow">ברוכה הבאה</p>
          <h1>העדפות ברורות.<br />בחירה רגועה יותר.</h1>
          <p className="lead">היכנסי כדי למצוא את התורמים הקרובים ביותר להעדפות שלך מתוך המאגר הזמין.</p>
          <form className="login-form" onSubmit={(event) => void submit(event)} noValidate>
            <label>
              <span>שם משתמש</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required aria-invalid={Boolean(error)} placeholder="הקלידי שם משתמש" />
            </label>
            <label>
              <span>סיסמה</span>
              <span className="password-field">
                <input value={password} onChange={(event) => setPassword(event.target.value)} type={passwordVisible ? 'text' : 'password'} autoComplete="current-password" required aria-invalid={Boolean(error)} placeholder="הקלידי סיסמה" />
                <button type="button" onClick={() => setPasswordVisible((value) => !value)} aria-label={passwordVisible ? 'הסתרת סיסמה' : 'הצגת סיסמה'}><Icon name={passwordVisible ? 'eyeOff' : 'eye'} /></button>
              </span>
            </label>
            {error && <p className="form-error" role="alert"><Icon name="info" /> {error}</p>}
            <label className="legal-consent">
              <input type="checkbox" checked={legalAccepted} onChange={(event) => setLegalAccepted(event.target.checked)} aria-label="אישור תנאי השימוש ומדיניות הפרטיות" />
              <span>קראתי ואני מסכימה ל<button className="legal-link" type="button" onClick={() => setOpenLegalDocument('terms')}>תנאי השימוש</button> ול<button className="legal-link" type="button" onClick={() => setOpenLegalDocument('privacy')}>מדיניות הפרטיות</button>.</span>
            </label>
            <button className="button button-primary button-full" type="submit" disabled={submitting || !username.trim() || !password || !legalAccepted}>
              {submitting && <span className="spinner" />}
              {submitting ? 'מתחברת…' : 'כניסה'}
            </button>
          </form>
          <p className="privacy-note"><Icon name="lock" /><span>הגישה מיועדת למשתמשות מורשות. פרטי ההתחברות נבדקים באופן מאובטח ואינם נשמרים במכשיר.</span></p>
        </div>
      </section>
      {openLegalDocument && <LegalDialog kind={openLegalDocument} onClose={() => setOpenLegalDocument(null)} />}
    </main>
  )
}

interface WelcomeScreenProps {
  donorCount: number
  onStart: () => void
  onLogout: () => void
}

function WelcomeScreen({ donorCount, onStart, onLogout }: WelcomeScreenProps) {
  return (
    <main className="app-shell" dir="rtl">
      <section className="screen with-bottom-action">
        <ScreenHeader title="היכרות קצרה" action={<button className="icon-button" type="button" onClick={onLogout} aria-label="יציאה"><Icon name="logout" /></button>} />
        <div className="welcome-content">
          <div className="welcome-symbol" aria-hidden="true"><BrandMark /></div>
          <p className="eyebrow">לפני שמתחילות</p>
          <h2>חמש שאלות קצרות, בדרך להתאמה הקרובה ביותר</h2>
          <p>נשאל על רקע וכמה מאפיינים. בכל שלב אפשר לבחור <strong>״לא משנה לי״</strong>, ותמיד אפשר לחזור ולשנות.</p>
          <div className="info-card"><Icon name="info" /><p>הבחירות לא מסננות תורמים. הן משמשות לדירוג כל {donorCount} התורמים לפי מידת הקרבה להעדפות שלך.</p></div>
        </div>
        <div className="bottom-action"><button className="button button-primary button-full" type="button" onClick={onStart}>מתחילות</button></div>
      </section>
    </main>
  )
}

interface QuestionScreenProps {
  donors: Donor[]
  answers: PreferenceAnswers
  questionIndex: number
  onAnswer: (answers: PreferenceAnswers) => void
  onBack: () => void
  onNext: () => void
}

function QuestionScreen({ donors, answers, questionIndex, onAnswer, onBack, onNext }: QuestionScreenProps) {
  const questions = useMemo(() => buildQuestions(donors), [donors])
  const question = questions[questionIndex]!
  const answer = answers[question.key]
  const hasAnswer = Array.isArray(answer) ? answer.length > 0 : Boolean(answer)
  const progress = ((questionIndex + 1) / questions.length) * 100

  function choose(option: string) {
    if (!question.multi) {
      onAnswer({ ...answers, [question.key]: option })
      return
    }
    if (option === ANY_OPTION) {
      onAnswer({ ...answers, [question.key]: [ANY_OPTION] })
      return
    }
    const current = Array.isArray(answer) ? answer.filter((value) => value !== ANY_OPTION) : []
    const next = current.includes(option) ? current.filter((value) => value !== option) : [...current, option]
    onAnswer({ ...answers, [question.key]: next })
  }

  function selected(option: string) {
    return Array.isArray(answer) ? answer.includes(option) : answer === option
  }

  return (
    <main className="app-shell" dir="rtl">
      <section className="screen with-bottom-action">
        <ScreenHeader title="ההעדפות שלך" onBack={onBack} />
        <div className="progress-area">
          <div><span>שאלה {questionIndex + 1} מתוך {questions.length}</span><span>{Math.round(progress)}%</span></div>
          <div className="progress-track" role="progressbar" aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={questionIndex + 1}><span style={{ width: `${progress}%` }} /></div>
        </div>
        <div className="question-content">
          <h2>{question.title}</h2>
          <p>{question.hint}</p>
          <div className="choice-grid" role={question.multi ? 'group' : 'radiogroup'} aria-label="אפשרויות תשובה">
            {question.options.map((option) => (
              <button
                className={`choice${selected(option) ? ' selected' : ''}${option === ANY_OPTION ? ' any-choice' : ''}`}
                type="button"
                key={option}
                onClick={() => choose(option)}
                role={question.multi ? 'checkbox' : 'radio'}
                aria-checked={selected(option)}
              >
                <span className="choice-check"><Icon name="check" /></span>
                <span>{option}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="bottom-action action-pair">
          <button className="button button-secondary" type="button" onClick={onBack}>חזרה</button>
          <button className="button button-primary" type="button" onClick={onNext} disabled={!hasAnswer}>{questionIndex === questions.length - 1 ? 'מציאת התאמות' : 'המשך'}</button>
        </div>
      </section>
    </main>
  )
}

function ResultCard({ result, position, mediaRepository, onSelect, dragOffset, dragging, transitioning, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: {
  result: ReturnType<typeof rankClosestDonors>[number]
  position: number
  mediaRepository: DonorMediaRepository
  onSelect: () => void
  dragOffset: number
  dragging: boolean
  transitioning: boolean
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerUp: (event: PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void
}) {
  const { donor } = result
  const rotation = Math.max(-5, Math.min(5, dragOffset / 28))
  return (
    <article
      className={`donor-card swipe-card${position === 0 ? ' top-result' : ''}${dragging ? ' dragging' : ''}${transitioning ? ' transitioning' : ''}`}
      style={{ transform: `translate3d(${dragOffset}px, 0, 0) rotate(${rotation}deg)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div className="swipe-card-photo">
        <DonorImage donor={donor} mediaRepository={mediaRepository} large />
        <div className="swipe-card-photo-shade" aria-hidden="true" />
        <div className="match-line swipe-card-badges">
            {result.score === null ? <span className="flexible-badge">העדפות גמישות</span> : <span className="score-badge"><strong>{result.score}%</strong> קרבה</span>}
            {position === 0 && <span className="closest-label">הכי קרוב</span>}
        </div>
      </div>
      <div className="swipe-card-copy">
        <div>
          <h2>תורם <bdi>{donorDisplayNumber(donor.donorNumber)}</bdi></h2>
          <p>{donor.occupation || 'פרטי עיסוק לא צוינו'}</p>
        </div>
        <div className="trait-row">
          <span>{donor.eyeColor || '—'} עיניים</span>
          <span>{donor.hairColor || '—'} שיער</span>
          {donor.skinColor && <span>{donor.skinColor} עור</span>}
        </div>
      </div>
      {result.matchedLabels.length > 0 && <div className="matched-row"><Icon name="check" /><span>קרוב להעדפות: {result.matchedLabels.join(' · ')}</span></div>}
      <button className="card-action" type="button" onClick={onSelect}><span>לפרופיל המלא</span><Icon name="arrow" /></button>
    </article>
  )
}

interface ResultsScreenProps {
  donors: Donor[]
  answers: PreferenceAnswers
  mediaRepository: DonorMediaRepository
  currentIndex: number
  onIndexChange: (index: number) => void
  onBack: () => void
  onSelect: (donorId: string) => void
  onLogout: () => void
}

function ResultsScreen({ donors, answers, mediaRepository, currentIndex, onIndexChange, onBack, onSelect, onLogout }: ResultsScreenProps) {
  const ranked = useMemo(() => rankClosestDonors(donors, answers), [answers, donors])
  const safeIndex = Math.min(currentIndex, Math.max(0, ranked.length - 1))
  const result = ranked[safeIndex]!
  const nextResult = ranked[safeIndex + 1]
  const hasPreferences = ranked[0]?.activePreferenceCount !== 0
  const [dragOffset, setDragOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const pointerStart = useRef<{ id: number, x: number } | null>(null)
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current)
  }, [])

  useEffect(() => {
    if (currentIndex !== safeIndex) onIndexChange(safeIndex)
  }, [currentIndex, onIndexChange, safeIndex])

  function moveTo(nextIndex: number) {
    if (transitioning || nextIndex < 0 || nextIndex >= ranked.length || nextIndex === safeIndex) return
    const direction = nextIndex > safeIndex ? -1 : 1
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    setDragging(false)
    setTransitioning(true)
    setDragOffset(direction * Math.max(window.innerWidth, 480))
    transitionTimer.current = setTimeout(() => {
      onIndexChange(nextIndex)
      setTransitioning(false)
      setDragOffset(0)
      transitionTimer.current = null
    }, reducedMotion ? 0 : 190)
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (transitioning || (event.pointerType === 'mouse' && event.button !== 0)) return
    if ((event.target as HTMLElement).closest('button, a')) return
    pointerStart.current = { id: event.pointerId, x: event.clientX }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDragging(true)
    setDragOffset(0)
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (!dragging || pointerStart.current?.id !== event.pointerId) return
    const offset = event.clientX - pointerStart.current.x
    setDragOffset(offset)
    if (Math.abs(offset) > 8) event.preventDefault()
  }

  function finishPointer(event: PointerEvent<HTMLElement>, canceled = false) {
    if (pointerStart.current?.id !== event.pointerId) return
    const offset = event.clientX - pointerStart.current.x
    const threshold = Math.min(86, event.currentTarget.clientWidth * .22)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    pointerStart.current = null
    setDragging(false)
    if (!canceled && offset <= -threshold && safeIndex < ranked.length - 1) {
      moveTo(safeIndex + 1)
      return
    }
    if (!canceled && offset >= threshold && safeIndex > 0) {
      moveTo(safeIndex - 1)
      return
    }
    setDragOffset(0)
  }

  function handleKeyboard(event: KeyboardEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('button, a')) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      moveTo(safeIndex + 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      moveTo(safeIndex - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      moveTo(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      moveTo(ranked.length - 1)
    }
  }

  const progress = ((safeIndex + 1) / ranked.length) * 100
  return (
    <main className="app-shell" dir="rtl">
      <section className="screen results-screen">
        <ScreenHeader title="התוצאות שלך" onBack={onBack} action={<button className="icon-button" type="button" onClick={onLogout} aria-label="יציאה"><Icon name="logout" /></button>} />
        <div className="results-intro">
          <div className="results-title-row">
            <div>
              <p className="eyebrow">{ranked.length} תורמים זמינים</p>
              <h2>ההתאמות הקרובות ביותר</h2>
            </div>
            <button type="button" onClick={onBack}>שינוי העדפות</button>
          </div>
          <p className="results-summary">
            {hasPreferences ? 'כל התורמים מדורגים לפי הקרבה להעדפות שלך.' : 'כל התורמים במאגר זמינים לעיון.'}
            <span> כלי השוואה בלבד, לא המלצה רפואית.</span>
          </p>
        </div>
        <section className="swipe-results" aria-labelledby="current-match-position">
          <div className="deck-status">
            <span id="current-match-position" aria-live="polite"><strong>{safeIndex + 1}</strong> מתוך {ranked.length}</span>
            <span className="deck-hint">החליקי לצדדים כדי לעבור בין התורמים</span>
          </div>
          <div className="deck-progress" role="progressbar" aria-label="התקדמות בין ההתאמות" aria-valuemin={1} aria-valuemax={ranked.length} aria-valuenow={safeIndex + 1}><span style={{ width: `${progress}%` }} /></div>
          <div className="swipe-deck" role="region" aria-label="התאמות תורמים" tabIndex={0} onKeyDown={handleKeyboard}>
            {nextResult && (
              <div className="donor-card swipe-card swipe-card-behind" aria-hidden="true">
                <div className="swipe-card-behind-accent" />
              </div>
            )}
            <ResultCard
              key={result.donor.id}
              result={result}
              position={safeIndex}
              mediaRepository={mediaRepository}
              onSelect={() => onSelect(result.donor.id)}
              dragOffset={dragOffset}
              dragging={dragging}
              transitioning={transitioning}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={(event) => finishPointer(event)}
              onPointerCancel={(event) => finishPointer(event, true)}
            />
          </div>
          <nav className="deck-controls" aria-label="ניווט בין התאמות">
            <button className="deck-previous" type="button" onClick={() => moveTo(safeIndex - 1)} disabled={safeIndex === 0 || transitioning}><Icon name="arrow" /><span>הקודם</span></button>
            <button className="deck-next" type="button" onClick={() => moveTo(safeIndex + 1)} disabled={safeIndex === ranked.length - 1 || transitioning}><span>הבא</span><Icon name="arrow" /></button>
          </nav>
        </section>
      </section>
    </main>
  )
}

function formatMeasurement(value: number | null, unit: string) {
  return value === null ? 'לא צוין' : `${value} ${unit}`
}

interface DetailScreenProps {
  donor: Donor
  score: number | null
  mediaRepository: DonorMediaRepository
  onBack: () => void
  onOpenPdf: () => void
}

function DetailScreen({ donor, score, mediaRepository, onBack, onOpenPdf }: DetailScreenProps) {
  const details = [
    ['מוצא', donor.origin || 'לא צוין', true],
    ['דת', donor.religion || 'לא צוינה', false],
    ['צבע עיניים', donor.eyeColor || 'לא צוין', false],
    ['שיער', donor.hairColor || 'לא צוין', false],
    ['גוון עור', donor.skinColor || 'לא צוין', false],
    ['גובה', formatMeasurement(donor.heightMeters, 'מ׳'), false],
    ['משקל', formatMeasurement(donor.weightKg, 'ק״ג'), false],
    ['נשאויות גנטיות', isCarrierFree(donor) ? 'ללא נשאויות' : donor.geneticCarrierStatus, false],
    ['CMV IgG', donor.cmvIgg || 'לא צוין', false],
  ] as const
  return (
    <main className="app-shell" dir="rtl">
      <section className="screen detail-screen with-bottom-action">
        <ScreenHeader title="פרופיל תורם" onBack={onBack} />
        <div className="profile-hero">
          <DonorImage donor={donor} mediaRepository={mediaRepository} large />
          <div>
            {score === null ? <span className="flexible-badge">העדפות גמישות</span> : <span className="score-badge"><strong>{score}%</strong> קרבה להעדפות</span>}
            <h2>תורם <bdi>{donorDisplayNumber(donor.donorNumber)}</bdi></h2>
            <p>{donor.occupation || 'פרטי עיסוק לא צוינו'}</p>
          </div>
        </div>
        <div className="detail-content">
          <section aria-labelledby="profile-details-title">
            <h3 id="profile-details-title">פרטים עיקריים</h3>
            <dl className="detail-grid">
              {details.map(([label, value, wide]) => <div className={wide ? 'wide' : undefined} key={label}><dt>{label}</dt><dd className={label === 'גובה' || label === 'משקל' ? 'numeric' : undefined}>{value}</dd></div>)}
            </dl>
          </section>
          <div className="medical-note"><Icon name="info" /><p><strong>חשוב לדעת</strong><br />הדירוג מבוסס על ההעדפות שסימנת ועל המידע הזמין. לפני קבלת החלטה יש להתייעץ עם הצוות הרפואי.</p></div>
        </div>
        <div className="bottom-action profile-action">
          <button className="button button-primary button-full" type="button" onClick={onOpenPdf}><Icon name="document" /><span><strong>צפייה בפרטים המורחבים</strong><small>מסמך התורם המקורי · 3 עמודים</small></span></button>
        </div>
      </section>
    </main>
  )
}

function DonorDataError({ onRetry, onLogout }: { onRetry: () => void, onLogout: () => void }) {
  return (
    <main className="app-shell" dir="rtl">
      <section className="screen centered-state">
        <span className="state-icon"><Icon name="info" /></span>
        <h1>לא הצלחנו לטעון את מאגר התורמים</h1>
        <p>בדקי את החיבור ונסי שוב. אם הבעיה נמשכת, פני לצוות המרפאה.</p>
        <button className="button button-primary button-full" type="button" onClick={onRetry}><Icon name="refresh" /> ניסיון נוסף</button>
        <button className="text-button" type="button" onClick={onLogout}>יציאה</button>
      </section>
    </main>
  )
}

function EmptyDonors({ onLogout }: { onLogout: () => void }) {
  return (
    <main className="app-shell" dir="rtl">
      <section className="screen centered-state">
        <span className="state-icon"><Icon name="info" /></span>
        <h1>המאגר עדיין אינו זמין</h1>
        <p>לא נמצאו תורמים להצגה כרגע. נסי שוב מאוחר יותר או פני לצוות המרפאה.</p>
        <button className="text-button" type="button" onClick={onLogout}>יציאה</button>
      </section>
    </main>
  )
}

export function App({
  accessService = firebaseUserAccessService,
  donorRepository = firebaseDonorRepository,
  mediaRepository = firebaseDonorMediaRepository,
}: AppProps) {
  const [session, setSession] = useState<UserSessionState>('loading')
  const [donors, setDonors] = useState<Donor[]>([])
  const [donorLoadState, setDonorLoadState] = useState<DonorLoadState>('idle')
  const [retry, setRetry] = useState(0)
  const [screen, setScreen] = useState<AppScreen>('welcome')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<PreferenceAnswers>({})
  const [resultIndex, setResultIndex] = useState(0)
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(null)

  useEffect(() => accessService.observe((state) => {
    setSession(state)
    if (state === 'anonymous') {
      setScreen('welcome')
      setQuestionIndex(0)
      setAnswers({})
      setResultIndex(0)
      setSelectedDonorId(null)
      setDonors([])
      setDonorLoadState('idle')
    }
  }), [accessService])

  useEffect(() => {
    if (session !== 'authenticated') return
    let active = true
    let unsubscribe: (() => void) | undefined
    setDonorLoadState('loading')
    void donorRepository.subscribe(
      (nextDonors) => {
        if (!active) return
        setDonors(nextDonors)
        setDonorLoadState('ready')
      },
      () => {
        if (active) setDonorLoadState('error')
      },
    ).then((nextUnsubscribe) => {
      if (active) unsubscribe = nextUnsubscribe
      else nextUnsubscribe()
    }).catch(() => {
      if (active) setDonorLoadState('error')
    })
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [donorRepository, retry, session])

  const ranked = useMemo(() => rankClosestDonors(donors, answers), [answers, donors])
  const lastQuestionIndex = useMemo(() => buildQuestions(donors).length - 1, [donors])
  const selectedResult = selectedDonorId ? ranked.find((result) => result.donor.id === selectedDonorId) : undefined

  async function logout() {
    await accessService.logout()
  }

  if (session === 'loading') return <PublicSiteFrame><LoadingScreen message="בודקות את החיבור המאובטח…" /></PublicSiteFrame>
  if (session === 'anonymous') return <PublicSiteFrame><LoginScreen service={accessService} /></PublicSiteFrame>
  if (donorLoadState === 'idle' || donorLoadState === 'loading') return <PublicSiteFrame><LoadingScreen message="טוענות את מאגר התורמים…" /></PublicSiteFrame>
  if (donorLoadState === 'error') return <PublicSiteFrame><DonorDataError onRetry={() => setRetry((value) => value + 1)} onLogout={() => void logout()} /></PublicSiteFrame>
  if (donors.length === 0) return <PublicSiteFrame><EmptyDonors onLogout={() => void logout()} /></PublicSiteFrame>

  if (screen === 'questions') {
    return <PublicSiteFrame><QuestionScreen donors={donors} answers={answers} questionIndex={questionIndex} onAnswer={(nextAnswers) => {
      setAnswers(nextAnswers)
      setResultIndex(0)
    }} onBack={() => {
      if (questionIndex === 0) setScreen('welcome')
      else setQuestionIndex((value) => value - 1)
    }} onNext={() => {
      if (questionIndex === lastQuestionIndex) setScreen('results')
      else setQuestionIndex((value) => value + 1)
    }} /></PublicSiteFrame>
  }
  if (screen === 'results') return <PublicSiteFrame><ResultsScreen donors={donors} answers={answers} mediaRepository={mediaRepository} currentIndex={resultIndex} onIndexChange={setResultIndex} onBack={() => {
    setQuestionIndex(lastQuestionIndex)
    setScreen('questions')
  }} onSelect={(donorId) => {
    setSelectedDonorId(donorId)
    setScreen('detail')
  }} onLogout={() => void logout()} /></PublicSiteFrame>
  if (screen === 'detail' && selectedResult) return <PublicSiteFrame><DetailScreen donor={selectedResult.donor} score={selectedResult.score} mediaRepository={mediaRepository} onBack={() => setScreen('results')} onOpenPdf={() => setScreen('pdf')} /></PublicSiteFrame>
  if (screen === 'pdf' && selectedResult) return <PublicSiteFrame><PdfViewer donor={selectedResult.donor} mediaRepository={mediaRepository} onBack={() => setScreen('detail')} /></PublicSiteFrame>
  return <PublicSiteFrame><WelcomeScreen donorCount={donors.length} onStart={() => {
    setQuestionIndex(0)
    setScreen('questions')
  }} onLogout={() => void logout()} /></PublicSiteFrame>
}

export default App
