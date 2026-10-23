import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBTgHqIpECnSGYoC6dVsIKsuUQ9T0q-kY",
  authDomain: "igcooking.firebaseapp.com",
  projectId: "igcooking",
  storageBucket: "igcooking.firebasestorage.app",
  messagingSenderId: "266468610536",
  appId: "1:266468610536:web:765f79132378df2ba6545d"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();