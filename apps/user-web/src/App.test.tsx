import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import type { UserAccessService } from './features/auth/userAccess'
import type { Donor } from './features/donors/donor'
import type { DonorRepository } from './features/donors/donorRepository'
import type { DonorMediaRepository } from './features/donors/mediaRepository'
import { ANY_OPTION } from './features/matching/matching'

const donors: Donor[] = [
  {
    id: 'one', donorNumber: 'One 1001', geneticCarrierStatus: 'שלילי', occupation: 'מהנדס',
    origin: 'ישראל', religion: 'יהודי', skinColor: 'בהיר', eyeColor: 'כחול', hairColor: 'חום, גלי',
    heightMeters: 1.8, weightKg: 80, cmvIgg: 'שלילי',
  },
  {
    id: 'two', donorNumber: 'Two 1002', geneticCarrierStatus: 'חיובי', occupation: 'סטודנט',
    origin: 'פולין', religion: 'יהודי', skinColor: 'שזוף', eyeColor: 'חום', hairColor: 'שחור, חלק',
    heightMeters: 1.75, weightKg: 75, cmvIgg: 'חיובי',
  },
  {
    id: 'three', donorNumber: 'Three 1003', geneticCarrierStatus: 'שלילי', occupation: 'מורה',
    origin: 'ישראל', religion: 'יהודי', skinColor: 'בהיר', eyeColor: 'ירוק', hairColor: 'חום, חלק',
    heightMeters: 1.78, weightKg: 77, cmvIgg: 'שלילי',
  },
  {
    id: 'four', donorNumber: 'Four 1004', geneticCarrierStatus: 'חיובי', occupation: 'רופא',
    origin: 'ספרד', religion: 'נוצרי', skinColor: 'כהה', eyeColor: 'חום', hairColor: 'שחור, מתולתל',
    heightMeters: 1.82, weightKg: 83, cmvIgg: 'חיובי',
  },
]

const accessService: UserAccessService = {
  observe(onChange) {
    onChange('authenticated')
    return () => undefined
  },
  login: vi.fn(),
  logout: vi.fn(),
}

const donorRepository: DonorRepository = {
  async subscribe(onData) {
    onData(donors)
    return () => undefined
  },
}

const mediaRepository: DonorMediaRepository = {
  getDetailPdf: vi.fn(),
  getProfileImage: vi.fn(),
}

afterEach(cleanup)

describe('user app flow', () => {
  it('requires consent and presents the privacy policy and terms in Hebrew before login', async () => {
    const anonymousAccessService: UserAccessService = {
      observe(onChange) {
        onChange('anonymous')
        return () => undefined
      },
      login: vi.fn(),
      logout: vi.fn(),
    }

    render(<App accessService={anonymousAccessService} donorRepository={donorRepository} mediaRepository={mediaRepository} />)

    const loginButton = screen.getByRole('button', { name: 'כניסה' })
    fireEvent.change(screen.getByPlaceholderText('הקלידי שם משתמש'), { target: { value: 'authorized-user' } })
    fireEvent.change(screen.getByPlaceholderText('הקלידי סיסמה'), { target: { value: 'secret' } })
    expect(loginButton).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'תנאי השימוש' }))
    const termsDialog = screen.getByRole('dialog', { name: 'תנאי שימוש' })
    expect(within(termsDialog).getByText(/כלי עזר בלבד/)).toBeInTheDocument()
    expect(within(termsDialog).getByText(/תמונות פרופיל המסומנות בתג ״AI״/)).toBeInTheDocument()
    fireEvent.click(within(termsDialog).getByRole('button', { name: 'סגירת תנאי שימוש' }))

    fireEvent.click(screen.getByRole('button', { name: 'מדיניות הפרטיות' }))
    const privacyDialog = screen.getByRole('dialog', { name: 'מדיניות פרטיות' })
    expect(within(privacyDialog).getByText(/העדפות התאמה/)).toBeInTheDocument()
    expect(within(privacyDialog).getByText(/Firebase ו-Google Cloud/)).toBeInTheDocument()
    fireEvent.click(within(privacyDialog).getByRole('button', { name: 'סגירת מדיניות פרטיות' }))

    fireEvent.click(screen.getByRole('checkbox', { name: 'אישור תנאי השימוש ומדיניות הפרטיות' }))
    expect(loginButton).toBeEnabled()
  })

  it('lets the user browse every ranked donor from the swipe deck', async () => {
    render(<App accessService={accessService} donorRepository={donorRepository} mediaRepository={mediaRepository} />)
    await screen.findByRole('heading', { name: /חמש שאלות קצרות/ })
    expect(screen.getByRole('contentinfo')).toHaveTextContent('בשיתוף פעולה עם Assuta Superm')
    expect(screen.getByRole('link', { name: 'מעבר לאתר Assuta Superm' })).toHaveAttribute('href', 'https://superm.assuta.co.il/')
    expect(screen.getByRole('link', { name: 'מעבר לאתר Assuta Superm' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('img', { name: 'לוגו Assuta Superm' })).toHaveAttribute('src', '/assuta-superm-logo.png')
    fireEvent.click(screen.getByRole('button', { name: 'מתחילות' }))

    for (let question = 0; question < 5; question += 1) {
      const choices = screen.getByRole('radiogroup', { name: 'אפשרויות תשובה' })
      fireEvent.click(within(choices).getByRole('radio', { name: ANY_OPTION }))
      fireEvent.click(screen.getByRole('button', { name: question === 4 ? 'מציאת התאמות' : 'המשך' }))
    }

    await waitFor(() => expect(screen.getByRole('heading', { name: 'ההתאמות הקרובות ביותר' })).toBeInTheDocument())
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('העדפות גמישות')).toBeInTheDocument()
    expect(screen.getByText(/כל התורמים במאגר זמינים לעיון/)).toBeInTheDocument()

    const progress = screen.getByRole('progressbar', { name: 'התקדמות בין ההתאמות' })
    const seenDonors = new Set<string>()
    seenDonors.add(screen.getByRole('heading', { name: /תורם/ }).textContent ?? '')
    expect(progress).toHaveAttribute('aria-valuenow', '1')

    for (let position = 2; position <= donors.length; position += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'הבא' }))
      await waitFor(() => expect(progress).toHaveAttribute('aria-valuenow', String(position)))
      seenDonors.add(screen.getByRole('heading', { name: /תורם/ }).textContent ?? '')
    }

    expect(seenDonors.size).toBe(donors.length)
    expect(screen.getByRole('button', { name: 'הבא' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'לפרופיל המלא' }))
    expect(screen.getByRole('heading', { name: 'פרופיל תורם' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /צפייה בפרטים המורחבים/ })).toBeInTheDocument()
  })
})
