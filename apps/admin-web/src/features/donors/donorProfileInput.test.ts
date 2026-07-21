import { describe, expect, it } from 'vitest'

import { parseDonorProfileImageInput } from './donorProfileInput'

describe('donor profile input parsing', () => {
  it('extracts donor and parent appearance from the first detail page', () => {
    const page = `Alias - 1000 עובדות ומספרים גובה : 1.80 מ ' משקל : 90 ק " ג
      מבנה גוף : חסון מאפייני פנים : ריסים ארוכים נמשים : ללא צבע שיער : חום בהיר
      סוג שיער : גלי , מלא צבע עיניים : כחול - ירוק צורת עיניים : שקדיות
      צבע עור : בהיר - משתזף סוג דם : O+ דת : יהודי CMV IgG : חיובי
      רקע משפחתי אם מוצא : ארץ א , ארץ ב השכלה : תואר עיסוק : ניהול
      צבע עיניים : כחול גוון עור : בהיר סוג שיער : חום , מתולתל גובה : 1.70 מ '
      אב מוצא : ארץ ג צבע עיניים : חום גוון עור : שזוף סוג שיער : שחור , מתולתל
      גובה : 1.80 מ ' GENEX התרשמות הצוות`

    expect(parseDonorProfileImageInput(page)).toEqual({
      sourceVersion: 'catalog-detail-v1',
      build: 'חסון',
      skin: 'בהיר-משתזף',
      hair: 'חום בהיר, גלי, מלא',
      eyes: 'כחול-ירוק, שקדיות',
      facialDetails: ['ריסים ארוכים', 'נמשים: ללא'],
      maternalAppearance: "מוצא: ארץ א, ארץ ב; צבע עיניים: כחול; גוון עור: בהיר; שיער: חום, מתולתל; גובה: 1.70 מ '",
      paternalAppearance: "מוצא: ארץ ג; צבע עיניים: חום; גוון עור: שזוף; שיער: שחור, מתולתל; גובה: 1.80 מ '",
    })
  })

  it('does not enqueue incomplete appearance data', () => {
    expect(parseDonorProfileImageInput('עובדות ומספרים צבע עור : בהיר רקע משפחתי')).toBeNull()
  })
})
