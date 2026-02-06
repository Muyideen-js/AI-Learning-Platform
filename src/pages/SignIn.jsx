import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, User as UserIcon, ArrowLeft, Home } from 'lucide-react';
import './SignIn.css';

const signUpSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

const SignIn = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup, login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(isSignUp ? signUpSchema : signInSchema)
  });

  const onSubmit = async (data) => {
    setError('');
    setLoading(true);
    try {
      if (isSignUp) {
        await signup(data.email, data.password, data.name);
      } else {
        await login(data.email, data.password);
      }
      navigate('/');
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
      navigate('/');
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signin-page">
      <div className="signin-container">
        <div style={{ position: 'absolute', top: '24px', left: '24px', display: 'flex', gap: '8px' }}>
          <button onClick={() => navigate(-1)} style={{ padding: '8px', background: 'transparent', border: '2px solid var(--border-light)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s ease' }} title="Go Back">
            <ArrowLeft size={20} />
          </button>
          <button onClick={() => navigate('/')} style={{ padding: '8px', background: 'transparent', border: '2px solid var(--border-light)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s ease' }} title="Back to Home">
            <Home size={20} />
          </button>
        </div>
        <div className="signin-card">
          <h1 className="signin-title">
            {isSignUp ? 'Create Account' : 'Sign In'}
          </h1>
          <p className="signin-subtitle">
            {isSignUp
              ? 'Start your learning journey today'
              : 'Welcome back to AI Learning'}
          </p>

          {error && <div className="error-alert">{error}</div>}

          <form onSubmit={handleSubmit(onSubmit)} className="signin-form">
            {isSignUp && (
              <div className="form-group">
                <label htmlFor="name" className="form-label">
                  <UserIcon size={14} />
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  {...register('name')}
                  className={`input ${errors.name ? 'input-error' : ''}`}
                  placeholder="Enter your name"
                />
                {errors.name && (
                  <span className="error-message">{errors.name.message}</span>
                )}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email" className="form-label">
                <Mail size={14} />
                Email
              </label>
              <input
                id="email"
                type="email"
                {...register('email')}
                className={`input ${errors.email ? 'input-error' : ''}`}
                placeholder="Enter your email"
              />
              {errors.email && (
                <span className="error-message">{errors.email.message}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">
                <Lock size={14} />
                Password
              </label>
              <input
                id="password"
                type="password"
                {...register('password')}
                className={`input ${errors.password ? 'input-error' : ''}`}
                placeholder="Enter your password"
              />
              {errors.password && (
                <span className="error-message">{errors.password.message}</span>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading}
            >
              {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </button>
          </form>

          <div className="signin-divider">
            <span>OR</span>
          </div>

          <button
            onClick={handleGoogleSignIn}
            className="btn btn-outline btn-full"
            disabled={loading}
          >
            Continue with Google
          </button>

          <div className="signin-footer">
            <p>
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError('');
                }}
                className="link-button"
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignIn;

