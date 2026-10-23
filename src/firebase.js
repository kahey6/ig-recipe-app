import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// 已填入你截圖中的專屬 Firebase 金鑰
const firebaseConfig = {
  apiKey: "AIzaSyBTgHqIpECGnSGYoC6dVsiKsuUQ9T0q-kY",
  authDomain: "igcooking.firebaseapp.com",
  projectId: "igcooking",
  storageBucket: "igcooking.firebasestorage.app",
  messagingSenderId: "266468610536",
  appId: "1:266468610536:web:765f79132378df2ba6545d",
  measurementId: "G-C95QZ6Y77L"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

export { 
  signInWithPopup, 
  signOut, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
};