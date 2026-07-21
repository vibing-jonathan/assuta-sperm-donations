import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyBOsFugc8Ppr_3KrPMTRza209WHXjcx8Sk',
  authDomain: 'assuta-sperm-donations.firebaseapp.com',
  projectId: 'assuta-sperm-donations',
  storageBucket: 'assuta-sperm-donations.firebasestorage.app',
  messagingSenderId: '457707528309',
  appId: '1:457707528309:web:48ba9a0abc546c9cb6983c',
  measurementId: 'G-58W1KHWCTW',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
auth.languageCode = 'he'

export async function getDatabase() {
  const { getFirestore } = await import('firebase/firestore')
  return getFirestore(firebaseApp)
}
