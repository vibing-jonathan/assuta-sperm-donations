export const DONOR_PROFILE_INPUT_VERSION = 'catalog-detail-v1'

export interface DonorProfileImageInput {
  sourceVersion: typeof DONOR_PROFILE_INPUT_VERSION
  build: string
  skin: string
  hair: string
  eyes: string
  facialDetails: string[]
  maternalAppearance: string
  paternalAppearance: string
}

function clean(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\s*[-–]\s*/g, '-')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
}

function section(value: string, start: RegExp, end: RegExp) {
  const startMatch = start.exec(value)
  if (!startMatch) return ''
  const remaining = value.slice(startMatch.index + startMatch[0].length)
  const endMatch = end.exec(remaining)
  return endMatch ? remaining.slice(0, endMatch.index) : remaining
}

function field(value: string, label: string, nextLabels: string[]) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const boundary = nextLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const match = value.match(new RegExp(`${escapedLabel}\\s*:\\s*(.+?)(?=\\s+(?:${boundary})\\s*:|$)`, 'u'))
  return clean(match?.[1] ?? '')
}

const donorLabels = [
  'גובה', 'משקל', 'מבנה גוף', 'מאפייני פנים', 'נמשים', 'צבע שיער', 'סוג שיער',
  'צבע עיניים', 'צורת עיניים', 'צבע עור', 'סוג דם', 'דת', 'CMV IgG',
]
const parentLabels = ['מוצא', 'השכלה', 'עיסוק', 'צבע עיניים', 'גוון עור', 'סוג שיער', 'גובה']

function parentAppearance(value: string) {
  const parts = [
    ['מוצא', field(value, 'מוצא', parentLabels)],
    ['צבע עיניים', field(value, 'צבע עיניים', parentLabels)],
    ['גוון עור', field(value, 'גוון עור', parentLabels)],
    ['שיער', field(value, 'סוג שיער', parentLabels)],
    ['גובה', field(value, 'גובה', parentLabels)],
  ].filter((part) => part[1])
  return parts.map(([label, content]) => `${label}: ${content}`).join('; ')
}

export function parseDonorProfileImageInput(pageText: string): DonorProfileImageInput | null {
  const normalized = clean(pageText)
  const donorSection = section(normalized, /עובדות ומספרים/u, /רקע משפחתי/u)
  if (!donorSection) return null

  const mother = section(normalized, /רקע משפחתי\s+אם/u, /\s+אב\s+מוצא\s*:/u)
  const father = section(normalized, /\s+אב\s+(?=מוצא\s*:)/u, /(?:GENEX|התרשמות הצוות)/u)
  const hairColor = field(donorSection, 'צבע שיער', donorLabels)
  const hairType = field(donorSection, 'סוג שיער', donorLabels)
  const eyeColor = field(donorSection, 'צבע עיניים', donorLabels)
  const eyeShape = field(donorSection, 'צורת עיניים', donorLabels)
  const skin = field(donorSection, 'צבע עור', donorLabels)
  if (!skin || !hairColor || !eyeColor) return null

  const facialFeatures = field(donorSection, 'מאפייני פנים', donorLabels)
  const freckles = field(donorSection, 'נמשים', donorLabels)
  const facialDetails = [facialFeatures, freckles ? `נמשים: ${freckles}` : ''].filter(Boolean)

  return {
    sourceVersion: DONOR_PROFILE_INPUT_VERSION,
    build: field(donorSection, 'מבנה גוף', donorLabels),
    skin,
    hair: clean([hairColor, hairType].filter(Boolean).join(', ')),
    eyes: clean([eyeColor, eyeShape].filter(Boolean).join(', ')),
    facialDetails,
    maternalAppearance: parentAppearance(mother),
    paternalAppearance: parentAppearance(father),
  }
}
