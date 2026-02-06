import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Home } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import CustomSelect from '../components/CustomSelect';
import './CreateCompanion.css';

const companionSchema = z.object({
  name: z.string().min(1, 'Companion name is required'),
  subject: z.string().min(1, 'Please select a subject'),
  topic: z.string().min(1, 'Topic description is required'),
  duration: z.number().min(1, 'Duration must be at least 1 minute'),
  voice: z.string().min(1, 'Please select a voice'),
  style: z.string().min(1, 'Please select a communication style')
});

const SUBJECTS = [
  { value: 'Maths', label: 'Maths' },
  { value: 'Language', label: 'Language' },
  { value: 'Science', label: 'Science' },
  { value: 'History', label: 'History' },
  { value: 'Coding', label: 'Coding' },
  { value: 'Economics', label: 'Economics' },
  { value: 'Other', label: 'Other (Custom)' }
];

const VOICES = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' }
];

const STYLES = [
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Casual' }
];

const CreateCompanion = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customSubject, setCustomSubject] = useState('');

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(companionSchema),
    defaultValues: {
      subject: '',
      voice: '',
      style: ''
    }
  });
  
  const selectedSubject = watch('subject');

  const onSubmit = async (data) => {
    setError('');
    setLoading(true);
    try {
      const finalSubject = data.subject === 'Other' ? customSubject : data.subject;
      
      const companionData = {
        ...data,
        subject: finalSubject,
        createdBy: currentUser.uid,
        createdAt: new Date(),
        bookmarkedBy: [],
        curriculum: []
      };

      const docRef = await addDoc(collection(db, 'companions'), companionData);
      
      // Generate curriculum using AI
      try {
        const { generateCurriculum } = await import('../lib/gemini');
        const curriculum = await generateCurriculum(finalSubject, data.topic);
        
        await updateDoc(doc(db, 'companions', docRef.id), {
          curriculum: curriculum
        });
      } catch (curriculumError) {
        console.error('Curriculum generation failed:', curriculumError);
      }
      
      navigate(`/companion/${docRef.id}`);
    } catch (err) {
      setError(err.message || 'Failed to create companion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-companion-page">
      <div className="page-container">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => navigate(-1)} 
              style={{ 
                padding: '8px', 
                background: 'transparent', 
                border: '2px solid var(--border-light)', 
                color: 'var(--text-secondary)', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                transition: 'all 0.3s ease'
              }}
              title="Go Back"
            >
              <ArrowLeft size={20} />
            </button>
            <button 
              onClick={() => navigate('/')} 
              style={{ 
                padding: '8px', 
                background: 'transparent', 
                border: '2px solid var(--border-light)', 
                color: 'var(--text-secondary)', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                transition: 'all 0.3s ease'
              }}
              title="Back to Home"
            >
              <Home size={20} />
            </button>
          </div>
          <h1 className="page-title" style={{ margin: 0 }}>Create New Companion</h1>
        </div>

        <div className="create-companion-card">
          {error && <div className="error-alert">{error}</div>}

          <form onSubmit={handleSubmit(onSubmit)} className="companion-form">
            <div className="form-group">
              <label htmlFor="name" className="form-label">
                Companion Name <span className="required">*</span>
              </label>
              <input
                id="name"
                type="text"
                {...register('name')}
                className={`input ${errors.name ? 'input-error' : ''}`}
                placeholder="e.g., Math Tutor, Language Helper"
                disabled={loading}
              />
              {errors.name && (
                <span className="error-message">{errors.name.message}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">
                Subject <span className="required">*</span>
              </label>
                <Controller
                  name="subject"
                  control={control}
                  render={({ field }) => (
                    <CustomSelect
                      value={field.value}
                      onChange={field.onChange}
                      options={SUBJECTS}
                      placeholder="Select a subject"
                      disabled={loading}
                    />
                  )}
                />
              {errors.subject && (
                <span className="error-message">{errors.subject.message}</span>
              )}
              {selectedSubject === 'Other' && (
                <div style={{ marginTop: '12px' }}>
                  <input
                    type="text"
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    placeholder="Enter custom subject"
                    className="input"
                    style={{ width: '100%' }}
                    disabled={loading}
                  />
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="topic" className="form-label">
                Topic Description <span className="required">*</span>
              </label>
              <textarea
                id="topic"
                {...register('topic')}
                className={`input ${errors.topic ? 'input-error' : ''}`}
                placeholder="Describe what this companion will teach..."
                rows={4}
                disabled={loading}
              />
              {errors.topic && (
                <span className="error-message">{errors.topic.message}</span>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="duration" className="form-label">
                  Session Duration (minutes) <span className="required">*</span>
                </label>
                <input
                  id="duration"
                  type="number"
                  {...register('duration', { valueAsNumber: true })}
                  className={`input ${errors.duration ? 'input-error' : ''}`}
                  placeholder="e.g., 30"
                  min="1"
                  disabled={loading}
                />
                {errors.duration && (
                  <span className="error-message">{errors.duration.message}</span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">
                  Voice <span className="required">*</span>
                </label>
                <Controller
                  name="voice"
                  control={control}
                  render={({ field }) => (
                    <CustomSelect
                      value={field.value}
                      onChange={field.onChange}
                      options={VOICES}
                      placeholder="Select voice"
                      disabled={loading}
                    />
                  )}
                />
                {errors.voice && (
                  <span className="error-message">{errors.voice.message}</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Communication Style <span className="required">*</span>
              </label>
              <Controller
                name="style"
                control={control}
                render={({ field }) => (
                  <CustomSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={STYLES}
                    placeholder="Select style"
                    disabled={loading}
                  />
                )}
              />
              {errors.style && (
                <span className="error-message">{errors.style.message}</span>
              )}
            </div>

            <div className="form-actions">
              <button
                type="button"
                onClick={() => navigate('/library')}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? 'Creating & Generating Curriculum...' : 'Create Companion'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateCompanion;
