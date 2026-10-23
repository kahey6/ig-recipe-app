import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBTGhqIpECGnSGYoC6dVsiKsUQ9T0q-kY",
  authDomain: "igcooking.firebaseapp.com",
  projectId: "igcooking",
  storageBucket: "igcooking.appspot.com",
  messagingSenderId: "266468610536",
  appId: "1:266468610536:web:765f79132378df2ba6545d",
  measurementId: "G-C95QZ6Y77L"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();