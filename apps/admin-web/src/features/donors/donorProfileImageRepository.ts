import { firebaseApp } from '../../lib/firebase'

export interface DonorProfileImageRepository {
  getImageUrl(storagePath: string): Promise<string>
}

const imageUrlCache = new Map<string, Promise<string>>()

export const storageDonorProfileImageRepository: DonorProfileImageRepository = {
  getImageUrl(storagePath) {
    const cached = imageUrlCache.get(storagePath)
    if (cached) return cached
    const request = import('firebase/storage').then(async ({ getBlob, getStorage, ref }) => {
      const blob = await getBlob(ref(getStorage(firebaseApp), storagePath))
      return URL.createObjectURL(blob)
    })
    imageUrlCache.set(storagePath, request)
    request.catch(() => imageUrlCache.delete(storagePath))
    return request
  },
}
