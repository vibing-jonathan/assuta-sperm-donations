import { getStorage } from 'firebase-admin/storage'

const DONOR_PAGE_COUNT = 3

type DeleteStorageObject = (objectName: string) => Promise<unknown>

function normalizeDonorNumber(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('he')
}

export function donorStorageKey(value: string) {
  return Buffer.from(normalizeDonorNumber(value), 'utf8').toString('hex')
}

export function donorPageObjectNames(donorNumber: string) {
  const canonicalDonorNumber = donorNumber.replace(/\*{3}\s*$/, '').trim()
  const storageKeys = new Set([
    donorStorageKey(canonicalDonorNumber),
    donorStorageKey(donorNumber),
  ])

  return [...storageKeys].flatMap((storageKey) => [
    `donor-pages/${storageKey}/details.pdf`,
    ...Array.from(
      { length: DONOR_PAGE_COUNT },
      (_, pageIndex) => `donor-pages/${storageKey}/page-${pageIndex + 1}.jpg`,
    ),
  ])
}

export async function deleteDonorPageImages(
  donorNumber: string,
  deleteObject: DeleteStorageObject = (objectName) => getStorage()
    .bucket()
    .file(objectName)
    .delete({ ignoreNotFound: true }),
) {
  const objectNames = donorPageObjectNames(donorNumber)
  await Promise.all(objectNames.map((objectName) => deleteObject(objectName)))
  return objectNames.length
}
