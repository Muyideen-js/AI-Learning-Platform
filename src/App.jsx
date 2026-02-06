import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import FloatingNotifications from './components/FloatingNotifications';
import Home from './pages/Home';
import SignIn from './pages/SignIn';
import CompanionLibrary from './pages/CompanionLibrary';
import CreateCompanion from './pages/CreateCompanion';
import CompanionSession from './pages/CompanionSession';
import MyJourney from './pages/MyJourney';
import Subscription from './pages/Subscription';
import './App.css';

const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/sign-in" />;
};

function AppContent() {
  const location = useLocation();
  const showNavbar = location.pathname === '/';
  const showFooter = location.pathname === '/';

  return (
    <div className="app">
      {showNavbar && <Navbar />}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/library" element={<CompanionLibrary />} />
          <Route
            path="/create-companion"
            element={
              <PrivateRoute>
                <CreateCompanion />
              </PrivateRoute>
            }
          />
          <Route
            path="/companion/:id"
            element={
              <PrivateRoute>
                <CompanionSession />
              </PrivateRoute>
            }
          />
          <Route
            path="/my-journey"
            element={
              <PrivateRoute>
                <MyJourney />
              </PrivateRoute>
            }
          />
          <Route
            path="/subscription"
            element={
              <PrivateRoute>
                <Subscription />
              </PrivateRoute>
            }
          />
        </Routes>
      </main>
      {showFooter && <Footer />}
      <FloatingNotifications />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;
