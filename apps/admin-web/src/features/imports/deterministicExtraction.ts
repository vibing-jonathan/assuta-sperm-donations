import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import type { DonorInput } from '../donors/donor'
import { normalizeExtractedDonor } from '../donors/donorFieldRules'
import type { PdfScanResult } from './scanDonorPdf'

export const DETERMINISTIC_PARSER_VERSION = 'donor-table-v2'

export type DeterministicFallbackReason =
  | 'text_layer_unavailable'
  | 'headers_missing'
  | 'columns_ambiguous'
  | 'rows_ambiguous'
  | 'unsupported_layout'

export interface PositionedPdfText {
  text: string
  x: number
  y: number
  width: number
  height: number
}

export interface PositionedPdfPage {
  pageNumber: number
  items: PositionedPdfText[]
}

export interface DeterministicExtractionResult {
  donors: DonorInput[]
  warnings: string[]
}

export class DeterministicExtractionFailure extends Error {
  readonly reason: DeterministicFallbackReason

  constructor(reason: DeterministicFallbackReason) {
    super(reason)
    this.name = 'DeterministicExtractionFailure'
    this.reason = reason
  }
}

type ColumnKey = Exclude<keyof DonorInput, 'geneticCarrierStatus'>

const columns: ColumnKey[] = [
  'donorNumber',
  'occupation',
  'origin',
  'religion',
  'skinColor',
  'eyeColor',
  'hairColor',
  'heightMeters',
  'weightKg',
  'cmvIgg',
]

const headerMatchers: Record<ColumnKey, RegExp> = {
  donorNumber: /מס|תורם/,
  occupation: /עיסוק/,
  origin: /מוצא/,
  religion: /דת/,
  skinColor: /צבע|עור/,
  eyeColor: /עיניים/,
  hairColor: /שיער/,
  heightMeters: /גובה/,
  weightKg: /משקל/,
  cmvIgg: /c\s*m\s*v|i\s*g\s*g/i,
}

const coreHeaderColumns: ColumnKey[] = [
  'occupation', 'origin', 'religion', 'skinColor', 'eyeColor',
  'hairColor', 'heightMeters', 'weightKg',
]

function normalizeText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function centerX(item: PositionedPdfText) {
  return item.x + item.width / 2
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? 0
}

function matchesHeader(item: PositionedPdfText, key: ColumnKey) {
  return headerMatchers[key].test(normalizeText(item.text).toLowerCase())
}

function findColumnGeometry(page: PositionedPdfPage) {
  const coreHits = coreHeaderColumns.flatMap((key) => page.items
    .filter((item) => matchesHeader(item, key))
    .map((item) => ({ key, item })))
  const foundCore = new Set(coreHits.map((hit) => hit.key))
  if (foundCore.size !== coreHeaderColumns.length) {
    throw new DeterministicExtractionFailure('headers_missing')
  }

  const headerY = median(coreHits.map((hit) => hit.item.y))
  const headerBand = page.items.filter((item) => Math.abs(item.y - headerY) <= 26)
  const anchors = new Map<ColumnKey, number>()
  for (const key of columns) {
    const matches = headerBand.filter((item) => matchesHeader(item, key))
    if (matches.length === 0) throw new DeterministicExtractionFailure('headers_missing')
    anchors.set(key, matches.reduce((sum, item) => sum + centerX(item), 0) / matches.length)
  }

  const positions = columns.map((key) => anchors.get(key) ?? 0)
  const ordered = positions.every((position, index) => index === 0 || (positions[index - 1] ?? 0) - position >= 28)
  if (!ordered) throw new DeterministicExtractionFailure('columns_ambiguous')

  return { anchors, headerY }
}

function nearestColumn(item: PositionedPdfText, anchors: Map<ColumnKey, number>) {
  const itemCenter = centerX(item)
  return columns.reduce((closest, key) => {
    const distance = Math.abs(itemCenter - (anchors.get(key) ?? 0))
    return distance < closest.distance ? { key, distance } : closest
  }, { key: columns[0], distance: Number.POSITIVE_INFINITY }).key
}

function groupAnchorLines(items: PositionedPdfText[]) {
  const groups: Array<{ y: number; items: PositionedPdfText[] }> = []
  for (const item of [...items].sort((left, right) => right.y - left.y)) {
    const group = groups.find((candidate) => Math.abs(candidate.y - item.y) <= 3)
    if (group) group.items.push(item)
    else groups.push({ y: item.y, items: [item] })
  }
  return groups
}

const listFieldColumns = new Set<ColumnKey>(['origin', 'religion', 'skinColor', 'eyeColor', 'hairColor'])

function joinCell(items: PositionedPdfText[], preserveListLines = false) {
  const lines = groupAnchorLines(items)
    .sort((left, right) => right.y - left.y)
    .map((line) => normalizeText([...line.items]
      .sort((left, right) => right.x - left.x)
      .map((item) => item.text)
      .join(' ')))
    .filter(Boolean)
  return normalizeText(lines.join(preserveListLines ? ', ' : ' '))
}

function parseNumber(value: string) {
  const match = value.replace(/,/g, '.').match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

function parseHeight(value: string) {
  const parsed = parseNumber(value)
  if (parsed === null) return null
  return parsed >= 100 && parsed <= 250 ? parsed / 100 : parsed
}

function parseCmv(value: string) {
  const normalized = normalizeText(value).toLowerCase()
  if (/חיובי|positive|\bpos\b|\+/.test(normalized)) return 'חיובי'
  if (/שלילי|negative|\bneg\b|−|-/.test(normalized)) return 'שלילי'
  return ''
}

function parsePage(page: PositionedPdfPage) {
  const { anchors, headerY } = findColumnGeometry(page)
  const tableMinX = (anchors.get('cmvIgg') ?? 0) - 55
  const tableMaxX = (anchors.get('donorNumber') ?? 0) + 55
  const bodyItems = page.items.filter((item) => {
    const itemCenter = centerX(item)
    return normalizeText(item.text)
      && item.y < headerY - 18
      && itemCenter >= tableMinX
      && itemCenter <= tableMaxX
  })
  if (bodyItems.length === 0) throw new DeterministicExtractionFailure('text_layer_unavailable')

  const donorItems = bodyItems.filter((item) => nearestColumn(item, anchors) === 'donorNumber')
  const anchorLines = groupAnchorLines(donorItems.filter((item) => /\d/.test(item.text)))
  if (anchorLines.length === 0) throw new DeterministicExtractionFailure('rows_ambiguous')

  const rowAnchors = anchorLines.map((line) => line.y).sort((left, right) => right - left)
  const gaps = rowAnchors.slice(1).map((anchor, index) => (rowAnchors[index] ?? anchor) - anchor)
  if (gaps.some((gap) => gap < 24)) throw new DeterministicExtractionFailure('rows_ambiguous')
  const typicalGap = median(gaps.length > 0 ? gaps : [70])

  const warnings: string[] = []
  const donors = rowAnchors.map((anchorY, rowIndex) => {
    const top = rowIndex === 0
      ? headerY - 18
      : ((rowAnchors[rowIndex - 1] ?? headerY) + anchorY) / 2
    const bottom = rowIndex === rowAnchors.length - 1
      ? Math.max(0, anchorY - typicalGap / 2)
      : (anchorY + (rowAnchors[rowIndex + 1] ?? 0)) / 2
    const rowItems = bodyItems.filter((item) => item.y <= top && item.y > bottom)
    const cells = new Map<ColumnKey, PositionedPdfText[]>()
    for (const item of rowItems) {
      const key = nearestColumn(item, anchors)
      cells.set(key, [...(cells.get(key) ?? []), item])
    }
    const populatedColumns = [...cells.values()].filter((cellItems) => joinCell(cellItems)).length
    if (populatedColumns < 5) throw new DeterministicExtractionFailure('unsupported_layout')

    const text = (key: ColumnKey) => joinCell(cells.get(key) ?? [], listFieldColumns.has(key))
    const heightText = text('heightMeters')
    const weightText = text('weightKg')
    const cmvText = text('cmvIgg')
    const heightMeters = parseHeight(heightText)
    const weightKg = parseNumber(weightText)
    const cmvIgg = parseCmv(cmvText)
    if (heightText && heightMeters === null) warnings.push(`עמוד ${page.pageNumber}, שורה ${rowIndex + 1}: הגובה לא זוהה.`)
    if (weightText && weightKg === null) warnings.push(`עמוד ${page.pageNumber}, שורה ${rowIndex + 1}: המשקל לא זוהה.`)
    if (cmvText && !cmvIgg) warnings.push(`עמוד ${page.pageNumber}, שורה ${rowIndex + 1}: תוצאת CMV IgG לא זוהתה.`)

    return normalizeExtractedDonor({
      donorNumber: text('donorNumber'),
      occupation: text('occupation'),
      origin: text('origin'),
      religion: text('religion'),
      skinColor: text('skinColor'),
      eyeColor: text('eyeColor'),
      hairColor: text('hairColor'),
      heightMeters,
      weightKg,
      cmvIgg,
    })
  })

  if (donors.some((donor) => !donor.donorNumber || !/\d/.test(donor.donorNumber) || donor.donorNumber.length > 100)) {
    throw new DeterministicExtractionFailure('rows_ambiguous')
  }
  return { donors, warnings }
}

export function parseDeterministicTablePages(pages: PositionedPdfPage[]): DeterministicExtractionResult {
  if (pages.length === 0 || pages.every((page) => page.items.length === 0)) {
    throw new DeterministicExtractionFailure('text_layer_unavailable')
  }
  const parsed = pages.map(parsePage)
  const donors = parsed.flatMap((page) => page.donors)
  if (donors.length === 0 || donors.length > 500) {
    throw new DeterministicExtractionFailure('rows_ambiguous')
  }
  return { donors, warnings: parsed.flatMap((page) => page.warnings) }
}

export async function extractDonorsDeterministically(file: File, range: PdfScanResult) {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const document = await loadingTask.promise
  const pages: PositionedPdfPage[] = []
  try {
    for (let pageNumber = range.startPage; pageNumber <= range.endPage; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      pages.push({
        pageNumber,
        items: content.items.flatMap((item) => 'str' in item && item.str.trim() ? [{
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        }] : []),
      })
    }
    return parseDeterministicTablePages(pages)
  } finally {
    await loadingTask.destroy()
  }
}
