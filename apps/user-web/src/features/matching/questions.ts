import type { Donor } from '../donors/donor'
import {
  ANY_OPTION,
  HAIR_TEXTURES,
  colorValues,
  hairAttributes,
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
  const origins = distinct(donors.flatMap((donor) => splitListValues(donor.origin)))
  const religions = distinct(donors.flatMap((donor) => splitListValues(donor.religion)))
  const hairColors = distinct(donors.flatMap((donor) => hairAttributes(donor.hairColor).colors))
  const availableTextures = HAIR_TEXTURES.filter((texture) => donors.some(
    (donor) => hairAttributes(donor.hairColor).textures.includes(texture),
  ))
  const skinColors = distinct(donors.map((donor) => donor.skinColor))
  const eyeColors = distinct(donors.flatMap((donor) => colorValues(donor.eyeColor)))

  return [
    { key: 'origin', title: 'האם את מחפשת תורם ממוצא מסוים?', hint: 'אפשר לבחור יותר מאפשרות אחת', multi: true, options: withAny(origins) },
    { key: 'religion', title: 'האם את מחפשת תורם יהודי או מדת אחרת?', hint: 'בחרי את האפשרות הקרובה ביותר להעדפה שלך', options: withAny(religions) },
    { key: 'carrierFree', title: 'האם את מחפשת תורם ללא נשאויות?', hint: 'הבחירה תשפיע על הדירוג, אך לא תסנן תורמים', options: ['כן', 'לא', ANY_OPTION] },
    { key: 'cmvNegative', title: 'האם את מחפשת תורם עם CMV שלילי?', hint: 'הבחירה תשפיע על הדירוג, אך לא תסנן תורמים', options: ['כן', 'לא', ANY_OPTION] },
    { key: 'hairColor', title: 'האם את מחפשת תורם עם צבע שיער מסוים?', hint: 'בחרי את האפשרות הקרובה ביותר להעדפה שלך', options: withAny(hairColors) },
    { key: 'hairTexture', title: 'האם חשוב לך שיהיה לו שיער חלק, מתולתל או גלי?', hint: 'בחרי את האפשרות הקרובה ביותר להעדפה שלך', options: withAny([...availableTextures]) },
    { key: 'skinColor', title: 'האם את מחפשת תורם עם גוון עור מסוים?', hint: 'בחרי את האפשרות הקרובה ביותר להעדפה שלך', options: withAny(skinColors) },
    { key: 'eyeColor', title: 'האם את מחפשת תורם עם צבע עיניים מסוים?', hint: 'בחרי את האפשרות הקרובה ביותר להעדפה שלך', options: withAny(eyeColors) },
  ]
}
