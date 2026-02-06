import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCoxNDZmvk-Ve3s6OZ4w3AXI9LfnOM3gGA",
  authDomain: "saas-84df4.firebaseapp.com",
  projectId: "saas-84df4",
  storageBucket: "saas-84df4.firebasestorage.app",
  messagingSenderId: "818769244128",
  appId: "1:818769244128:web:9648972c10e9d73a848585",
  measurementId: "G-52KV32QE76"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export default app;

