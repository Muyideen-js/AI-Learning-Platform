import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Trophy, RotateCcw } from 'lucide-react';
import './QuizModal.css';

/**
 * Interactive Quiz Modal — gates module completion.
 * 
 * Props:
 * - isOpen: boolean
 * - module: { id, title, quiz: { questions: [...] } }
 * - onClose: () => void
 * - onPass: (score) => void   — called when score ≥ 70%
 * - onFail: (score) => void   — called when score < 70%
 */
const QuizModal = ({ isOpen, module, onClose, onPass, onFail }) => {
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);

  if (!isOpen || !module?.quiz?.questions) return null;

  const questions = module.quiz.questions;
  const totalQuestions = questions.length;
  const question = questions[currentQ];
  const progress = ((currentQ + 1) / totalQuestions) * 100;
  const passingScore = 70;

  const handleSelectAnswer = (optionIndex) => {
    if (showResults) return;
    setSelectedAnswers(prev => ({ ...prev, [currentQ]: optionIndex }));
  };

  const handleNext = () => {
    if (currentQ < totalQuestions - 1) {
      setCurrentQ(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentQ > 0) {
      setCurrentQ(prev => prev - 1);
    }
  };

  const handleSubmit = () => {
    let correct = 0;
    questions.forEach((q, i) => {
      if (selectedAnswers[i] === q.correctAnswer) {
        correct++;
      }
    });
    const finalScore = Math.round((correct / totalQuestions) * 100);
    setScore(finalScore);
    setShowResults(true);

    if (finalScore >= passingScore) {
      onPass?.(finalScore);
    } else {
      onFail?.(finalScore);
    }
  };

  const handleRetry = () => {
    setCurrentQ(0);
    setSelectedAnswers({});
    setShowResults(false);
    setScore(0);
  };

  const handleClose = () => {
    setCurrentQ(0);
    setSelectedAnswers({});
    setShowResults(false);
    setScore(0);
    onClose?.();
  };

  const allAnswered = Object.keys(selectedAnswers).length === totalQuestions;
  const passed = score >= passingScore;

  return (
    <div className="quiz-backdrop">
      <div className="quiz-modal">
        {/* Header */}
        <div className="quiz-header">
          <div className="quiz-header-left">
            <span className="quiz-module-tag">Module {module.id}</span>
            <h3 className="quiz-title">{module.title}</h3>
          </div>
          <button className="quiz-close-btn" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        {/* Progress Bar */}
        {!showResults && (
          <div className="quiz-progress-wrapper">
            <div className="quiz-progress-bar">
              <div className="quiz-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="quiz-progress-text">{currentQ + 1}/{totalQuestions}</span>
          </div>
        )}

        {/* Question / Results */}
        <div className="quiz-body">
          {!showResults ? (
            <>
              <p className="quiz-question">{question.question}</p>
              <div className="quiz-options">
                {question.options.map((option, idx) => (
                  <button
                    key={idx}
                    className={`quiz-option ${selectedAnswers[currentQ] === idx ? 'selected' : ''}`}
                    onClick={() => handleSelectAnswer(idx)}
                  >
                    <span className="quiz-option-letter">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="quiz-option-text">{option}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="quiz-results">
              <div className={`quiz-score-circle ${passed ? 'passed' : 'failed'}`}>
                <span className="quiz-score-number">{score}%</span>
              </div>
              <h3 className={`quiz-result-title ${passed ? 'passed' : 'failed'}`}>
                {passed ? '🎉 Module Complete!' : 'Keep Studying'}
              </h3>
              <p className="quiz-result-desc">
                {passed
                  ? `You scored ${score}%! The next module is now unlocked.`
                  : `You scored ${score}%. You need ${passingScore}% to unlock the next module. Review the material and try again!`
                }
              </p>

              {/* Per-question breakdown */}
              <div className="quiz-breakdown">
                {questions.map((q, i) => {
                  const isCorrect = selectedAnswers[i] === q.correctAnswer;
                  return (
                    <div key={i} className={`quiz-breakdown-item ${isCorrect ? 'correct' : 'wrong'}`}>
                      <div className="quiz-breakdown-header">
                        <span className="quiz-breakdown-icon">{isCorrect ? '✅' : '❌'}</span>
                        <span className="quiz-breakdown-q">Q{i + 1}: {q.question}</span>
                      </div>
                      {!isCorrect && (
                        <p className="quiz-breakdown-explanation">
                          Correct: <strong>{q.options[q.correctAnswer]}</strong>
                          {q.explanation && <> — {q.explanation}</>}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="quiz-footer">
          {!showResults ? (
            <>
              <button
                className="quiz-btn quiz-btn--secondary"
                onClick={handlePrev}
                disabled={currentQ === 0}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              {currentQ < totalQuestions - 1 ? (
                <button
                  className="quiz-btn quiz-btn--primary"
                  onClick={handleNext}
                  disabled={selectedAnswers[currentQ] === undefined}
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  className="quiz-btn quiz-btn--primary"
                  onClick={handleSubmit}
                  disabled={!allAnswered}
                >
                  <Trophy size={16} />
                  Submit Quiz
                </button>
              )}
            </>
          ) : (
            <>
              {!passed && (
                <button className="quiz-btn quiz-btn--secondary" onClick={handleRetry}>
                  <RotateCcw size={16} />
                  Retry Quiz
                </button>
              )}
              <button className="quiz-btn quiz-btn--primary" onClick={handleClose}>
                {passed ? 'Continue Learning' : 'Back to Study'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuizModal;
