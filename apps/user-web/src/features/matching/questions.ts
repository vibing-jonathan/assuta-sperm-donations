import type { Donor } from '../donors/donor'
import {
  ANY_OPTION,
  DARK_EYES_OPTION,
  LIGHT_EYES_OPTION,
  splitListValues,
  type PreferenceKey,
} from './matching'

export interface QuestionDefinition {
  key: PreferenceKey
  title: string
  hint: string
  multi?: boolean
  options: string[]
}

function distinct(values: string[]) {
  return [...new Set(values.map((value) => value.normalize('NFKC').trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'he'))
}

function withAny(values: string[]) {
  return [...values, ANY_OPTION]
}

export function buildQuestions(donors: Donor[]): QuestionDefinition[] {
  const religions = distinct(donors.flatMap((donor) => splitListValues(donor.religion)))
    .filter((religion) => religion !== 'לאחר גיור')
  const skinColors = distinct(donors.map((donor) => donor.skinColor))

  return [
    { key: 'religion', title: 'האם את מחפשת תורם יהודי או מדת אחרת?', hint: 'בחרי את האפשרות הקרובה ביותר להעדפה שלך', options: withAny(religions) },
    { key: 'carrierFree', title: 'האם את מחפשת תורם ללא נשאויות?', hint: 'הבחירה תשפיע על הדירוג, אך לא תסנן תורמים', options: ['כן', 'לא', ANY_OPTION] },
    { key: 'cmvNegative', title: 'האם את מחפשת תורם עם CMV שלילי?', hint: 'הבחירה תשפיע על הדירוג, אך לא תסנן תורמים', options: ['כן', 'לא', ANY_OPTION] },
    { key: 'skinColor', title: 'האם את מחפשת תורם עם גוון עור מסוים?', hint: 'בחרי את האפשרות הקרובה ביותר להעדפה שלך', options: withAny(skinColors) },
    { key: 'eyeColor', title: 'האם את מחפשת תורם עם עיניים בהירות או כהות?', hint: 'כחול וירוק נחשבים בהירים; חום ושחור נחשבים כהים', options: withAny([LIGHT_EYES_OPTION, DARK_EYES_OPTION]) },
  ]
}
