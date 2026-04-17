import { createContext, useContext, useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);

  const isOfflineFirestoreError = (error) => {
    const code = error?.code || '';
    const message = String(error?.message || '').toLowerCase();
    return (
      code === 'unavailable' ||
      message.includes('client is offline') ||
      message.includes('could not reach cloud firestore backend')
    );
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          // Fetch user data from Firestore
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            
            // Check daily streak
            const today = new Date().toISOString().split('T')[0];
            const lastLogin = data.lastLoginDate;
            let currentStreak = data.streakCount || 0;
            let needsUpdate = false;

            if (lastLogin !== today) {
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              const yesterdayStr = yesterday.toISOString().split('T')[0];

              if (lastLogin === yesterdayStr) {
                currentStreak += 1;
              } else {
                currentStreak = 1;
              }
              needsUpdate = true;
            }

            const updatedData = { ...data, lastLoginDate: today, streakCount: currentStreak };
            setUserData(updatedData);

            if (needsUpdate) {
              await setDoc(doc(db, 'users', user.uid), { lastLoginDate: today, streakCount: currentStreak }, { merge: true });
            }
          } else {
            // Create user document if it doesn't exist
            const newUserData = {
              uid: user.uid,
              email: user.email,
              name: user.displayName || user.email?.split('@')[0] || 'User',
              picture: user.photoURL || null,
              createdAt: new Date(),
              subscriptionTier: 'free',
              bookmarkedCompanions: [],
              lastLoginDate: new Date().toISOString().split('T')[0],
              streakCount: 1
            };
            await setDoc(doc(db, 'users', user.uid), newUserData);
            setUserData(newUserData);
          }
        } catch (error) {
          if (isOfflineFirestoreError(error)) {
            console.warn('Firestore appears offline. Using local auth profile until connection is restored.');
          } else {
            console.error('Error fetching user data:', error);
          }
          // Set basic user data from auth if Firestore fails
          setUserData({
            uid: user.uid,
            email: user.email,
            name: user.displayName || user.email?.split('@')[0] || 'User',
            picture: user.photoURL || null,
            subscriptionTier: 'free',
            bookmarkedCompanions: [],
            streakCount: 1
          });
        }
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signup = async (email, password, name) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    if (name) {
      await updateProfile(userCredential.user, { displayName: name });
    }
    const userData = {
      uid: userCredential.user.uid,
      email: userCredential.user.email,
      name: name || userCredential.user.email?.split('@')[0] || 'User',
      picture: null,
      createdAt: new Date(),
      subscriptionTier: 'free',
      bookmarkedCompanions: [],
      lastLoginDate: new Date().toISOString().split('T')[0],
      streakCount: 1
    };
    try {
      await setDoc(doc(db, 'users', userCredential.user.uid), userData);
    } catch (error) {
      console.error('Error creating user document:', error);
      throw new Error('Failed to create user profile. Please check Firestore rules.');
    }
    return userCredential;
  };

  // Helper to convert Firebase errors to user-friendly messages
  const getAuthErrorMessage = (error) => {
    const errorCode = error.code;
    const errorMessages = {
      'auth/invalid-credential': 'Invalid credentials. Please check your email and password.',
      'auth/user-not-found': 'No account found with this email address.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password': 'Password should be at least 6 characters.',
      'auth/invalid-email': 'Invalid email address format.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Please check your connection.',
      'auth/popup-closed-by-user': 'Sign-in popup was closed before completing.',
      'auth/cancelled-popup-request': 'Only one popup request is allowed at a time.',
    };
    return errorMessages[errorCode] || error.message;
  };

  const login = async (email, password) => {
    try {
      return await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw new Error(getAuthErrorMessage(error));
    }
  };

  const loginWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        const userData = {
          uid: user.uid,
          email: user.email,
          name: user.displayName || user.email?.split('@')[0] || 'User',
          picture: user.photoURL || null,
          createdAt: new Date(),
          subscriptionTier: 'free',
          bookmarkedCompanions: [],
          lastLoginDate: new Date().toISOString().split('T')[0],
          streakCount: 1
        };
        try {
          await setDoc(doc(db, 'users', user.uid), userData);
        } catch (error) {
          console.error('Error creating user document:', error);
          throw new Error('Failed to create user profile. Please check Firestore rules.');
        }
      }
      return result;
    } catch (error) {
      throw new Error(getAuthErrorMessage(error));
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const refreshUserData = async () => {
    if (currentUser) {
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        }
      } catch (error) {
        console.error('Error refreshing user data:', error);
      }
    }
  };

  const value = {
    currentUser,
    userData,
    signup,
    login,
    loginWithGoogle,
    logout,
    refreshUserData
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

