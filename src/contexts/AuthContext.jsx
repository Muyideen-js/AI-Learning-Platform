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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          // Fetch user data from Firestore
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserData(userDoc.data());
          } else {
            // Create user document if it doesn't exist
            const newUserData = {
              uid: user.uid,
              email: user.email,
              name: user.displayName || user.email?.split('@')[0] || 'User',
              picture: user.photoURL || null,
              createdAt: new Date(),
              subscriptionTier: 'free',
              bookmarkedCompanions: []
            };
            await setDoc(doc(db, 'users', user.uid), newUserData);
            setUserData(newUserData);
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          // Set basic user data from auth if Firestore fails
          setUserData({
            uid: user.uid,
            email: user.email,
            name: user.displayName || user.email?.split('@')[0] || 'User',
            picture: user.photoURL || null,
            subscriptionTier: 'free',
            bookmarkedCompanions: []
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
      bookmarkedCompanions: []
    };
    try {
      await setDoc(doc(db, 'users', userCredential.user.uid), userData);
    } catch (error) {
      console.error('Error creating user document:', error);
      throw new Error('Failed to create user profile. Please check Firestore rules.');
    }
    return userCredential;
  };

  const login = async (email, password) => {
    return await signInWithEmailAndPassword(auth, email, password);
  };

  const loginWithGoogle = async () => {
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
        bookmarkedCompanions: []
      };
      try {
        await setDoc(doc(db, 'users', user.uid), userData);
      } catch (error) {
        console.error('Error creating user document:', error);
        throw new Error('Failed to create user profile. Please check Firestore rules.');
      }
    }
    return result;
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

