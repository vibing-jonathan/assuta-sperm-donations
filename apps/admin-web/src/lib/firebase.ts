import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyBOsFugc8Ppr_3KrPMTRza209WHXjcx8Sk',
  authDomain: 'assuta-sperm-donations.firebaseapp.com',
  projectId: 'assuta-sperm-donations',
  storageBucket: 'assuta-sperm-donations.firebasestorage.app',
  messagingSenderId: '457707528309',
  appId: '1:457707528309:web:ffcb400864d2df46b6983c',
  measurementId: 'G-7K0EQGX5WS',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
auth.languageCode = 'he'

export async function getDatabase() {
  const { getFirestore } = await import('firebase/firestore')
  return getFirestore(firebaseApp)
}

if (import.meta.env.PROD) {
  void import('firebase/analytics').then(async ({ getAnalytics, isSupported }) => {
    if (await isSupported()) getAnalytics(firebaseApp)
  })
}
