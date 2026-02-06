# AI Learning LMS

A modern, AI-powered Learning Management System built with React, Vite, and Firebase. Create personalized AI voice companions for interactive, voice-based learning sessions.

## Features

- 🔐 **Authentication**: Email/Password and Google OAuth
- 🤖 **AI Companion Creation**: Build custom learning companions with personalized voices
- 📚 **Companion Library**: Browse and search through available companions
- 🎤 **Voice Sessions**: Real-time voice-based learning interactions
- 📖 **My Journey**: Track your learning progress, bookmarks, and sessions
- ⭐ **Bookmarking**: Save favorite companions for quick access
- 💳 **Subscription Plans**: Free and Premium tiers

## Tech Stack

- **React 19** - UI library
- **Vite** - Build tool
- **Firebase** - Authentication & Firestore database
- **React Router** - Routing
- **React Hook Form + Zod** - Form validation
- **Lucide React** - Icons
- **Google Gemini API** - Real AI responses (Gemini 1.5 Flash)
- **CSS** - Styling (no frameworks)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Firebase project with Authentication and Firestore enabled

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain_here
   VITE_FIREBASE_PROJECT_ID=your_project_id_here
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket_here
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id_here
VITE_FIREBASE_APP_ID=your_app_id_here
VITE_VAPI_API_KEY=your_vapi_api_key_here
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

**Important:** You need a Google Gemini API key for real AI responses. Get one from [Google AI Studio](https://makersuite.google.com/app/apikey)

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:5173](http://localhost:5173) in your browser

## Firebase Setup

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication:
   - Email/Password
   - Google Sign-In
3. Create a Firestore database
4. Set up Firestore security rules (adjust as needed):
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
       match /companions/{companionId} {
         allow read: if true;
         allow create: if request.auth != null;
         allow update, delete: if request.auth != null && 
           (request.auth.uid == resource.data.createdBy || 
            request.auth.uid == request.resource.data.createdBy);
       }
       match /sessions/{sessionId} {
         allow read, write: if request.auth != null && 
           request.auth.uid == resource.data.userId;
       }
     }
   }
   ```

## Project Structure

```
src/
├── components/          # Reusable components
│   ├── Navbar.jsx
│   └── CompanionCard.jsx
├── contexts/           # React contexts
│   └── AuthContext.jsx
├── lib/                # Utilities and configs
│   └── firebase.js
├── pages/              # Page components
│   ├── Home.jsx
│   ├── SignIn.jsx
│   ├── CompanionLibrary.jsx
│   ├── CreateCompanion.jsx
│   ├── CompanionSession.jsx
│   ├── MyJourney.jsx
│   └── Subscription.jsx
├── App.jsx            # Main app component
├── main.jsx           # Entry point
└── index.css          # Global styles
```

## Features in Detail

### Authentication
- Email/Password registration and login
- Google OAuth integration
- Session persistence
- Protected routes

### Companion Creation
- Form validation with Zod
- Subject selection (Maths, Language, Science, History, Coding, Economics)
- Voice selection (Male/Female)
- Communication style (Formal/Casual)
- Duration setting

### Voice Sessions
- Real-time voice interaction (Vapi SDK integration needed)
- Session transcript display
- Session timer
- Session history tracking

### My Journey
- User profile display
- Statistics dashboard
- Bookmarked companions
- Recent sessions
- User-created companions

## Future Enhancements

- [ ] Complete Vapi SDK integration for voice sessions
- [ ] Payment processing (Stripe integration)
- [ ] Session analytics
- [ ] Export transcripts
- [ ] Advanced search filters
- [ ] Companion sharing
- [ ] Learning progress tracking
- [ ] Notifications

## License

MIT
