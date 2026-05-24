import React, { useState, useEffect, useRef } from 'react';

// Based on actual AWS certification exam timing:
// CLF-C02 (Cloud Practitioner): 90 min / 65 questions = ~83 sec/question
// SAA-C03 (Solutions Architect Associate): 130 min / 65 questions = 120 sec/question
const TIMING_BY_CERT = {
  'CLF-C02': 83,
  'SAA-C03': 120,
};
const DEFAULT_SECONDS_PER_QUESTION = 90;

function saveProgress(moduleName, score, total) {
  const key = 'quiz_progress';
  const existing = JSON.parse(localStorage.getItem(key) || '{}');
  if (!existing[moduleName]) existing[moduleName] = [];
  existing[moduleName].push({
    score,
    total,
    percentage: Math.round((score / total) * 100),
    date: new Date().toISOString(),
  });
  // Keep last 10 attempts per module
  if (existing[moduleName].length > 10) {
    existing[moduleName] = existing[moduleName].slice(-10);
  }
  localStorage.setItem(key, JSON.stringify(existing));
}

function getProgress() {
  return JSON.parse(localStorage.getItem('quiz_progress') || '{}');
}

function QuizMode({ questions, onSubmit, answersRevealed, moduleName, certification, onRequestHarder, onRequestEasier }) {
  const secondsPerQuestion = TIMING_BY_CERT[certification] || DEFAULT_SECONDS_PER_QUESTION;
  const totalTime = questions.length * secondsPerQuestion;
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(totalTime);
  const [timerActive, setTimerActive] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [timerActive]);

  useEffect(() => {
    if (timeLeft === 0 && timerActive && !submitted) {
      handleSubmit();
    }
  }, [timeLeft]);

  const startTimer = () => {
    setTimerActive(true);
    setTimerStarted(true);
  };

  const handleSelect = (qIndex, option) => {
    if (submitted) return;
    setAnswers({ ...answers, [qIndex]: option });
  };

  const handleSubmit = () => {
    setSubmitted(true);
    setTimerActive(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (onSubmit) onSubmit();

    const finalScore = questions.reduce((acc, q, i) => acc + (answers[i] === q.correct_answer ? 1 : 0), 0);
    if (moduleName) {
      saveProgress(moduleName, finalScore, questions.length);
      setProgressData(getProgress());
    }
  };

  const handleRetry = () => {
    setAnswers({});
    setSubmitted(false);
    setTimeLeft(totalTime);
    setTimerActive(false);
    setTimerStarted(false);
  };

  const [progressData, setProgressData] = useState(getProgress());

  const score = submitted
    ? questions.reduce((acc, q, i) => acc + (answers[i] === q.correct_answer ? 1 : 0), 0)
    : 0;

  const percentage = submitted ? Math.round((score / questions.length) * 100) : 0;
  const allAnswered = Object.keys(answers).length === questions.length;

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const moduleHistory = moduleName ? (progressData[moduleName] || []) : [];

  return (
    <div className="quiz-mode">
      {/* Timer bar */}
      {!submitted && timerActive && (
        <div className={`quiz-timer ${timeLeft <= 30 ? 'timer-warning' : ''}`}>
          <span className="timer-icon">&#9201;</span>
          <span className="timer-text">{formatTime(timeLeft)}</span>
          <div className="timer-bar">
            <div
              className="timer-fill"
              style={{ width: `${(timeLeft / totalTime) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Start quiz prompt */}
      {!submitted && !timerStarted && (
        <div className="quiz-start">
          <div className="quiz-start-info">
            <h3>Practice Quiz</h3>
            <p>{questions.length} questions | {formatTime(totalTime)} time limit | ~{Math.round(secondsPerQuestion / 60 * 10) / 10} min per question</p>
          </div>
          <button className="start-quiz-btn" onClick={startTimer}>
            Start Timed Quiz
          </button>
          <button className="start-quiz-btn untimed" onClick={() => setTimerStarted(true)}>
            Start Without Timer
          </button>
        </div>
      )}

      {/* Score display */}
      {submitted && (
        <div className={`quiz-score ${percentage === 100 ? 'perfect' : percentage >= 70 ? 'good' : 'needs-work'}`}>
          <div className="score-text">
            Score: {score} / {questions.length} ({percentage}%)
          </div>
          <div className="score-actions">
            {!answersRevealed && <button className="retry-btn" onClick={handleRetry}>Retry Quiz</button>}
          </div>
        </div>
      )}

      {/* Adaptive difficulty suggestions */}
      {submitted && (
        <div className="adaptive-feedback">
          {percentage === 100 && onRequestHarder && (
            <div className="adaptive-msg perfect-msg">
              <span>You aced it! Ready for a challenge?</span>
              <button className="adaptive-btn harder" onClick={onRequestHarder}>
                Generate Harder Questions
              </button>
            </div>
          )}
          {percentage < 50 && onRequestEasier && (
            <div className="adaptive-msg review-msg">
              <span>Let's review the fundamentals first.</span>
              <button className="adaptive-btn easier" onClick={onRequestEasier}>
                Generate Review Questions
              </button>
            </div>
          )}
        </div>
      )}

      {/* Progress history */}
      {moduleHistory.length >= 1 && (
        <div className="progress-history">
          <div className="progress-header">Your Progress ({moduleName})</div>
          <div className="progress-chart">
            {moduleHistory.map((entry, i) => (
              <div key={i} className="progress-bar-item">
                <div
                  className={`progress-bar-fill ${entry.percentage >= 70 ? 'good' : 'needs-work'}`}
                  style={{ height: `${entry.percentage}%` }}
                />
                <span className="progress-bar-label">{entry.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Questions */}
      {timerStarted && questions.map((q, qIndex) => {
        const selected = answers[qIndex];
        const isCorrect = submitted && selected === q.correct_answer;
        const isWrong = submitted && selected && selected !== q.correct_answer;

        return (
          <div key={qIndex} className={`quiz-question ${submitted ? (isCorrect ? 'correct' : isWrong ? 'wrong' : 'unanswered') : ''}`}>
            <div className="question-header">
              <span className="question-number">Question {qIndex + 1}</span>
              {submitted && (
                <span className={`question-badge ${isCorrect ? 'correct' : 'incorrect'}`}>
                  {isCorrect ? 'Correct' : selected ? 'Incorrect' : 'Not answered'}
                </span>
              )}
            </div>

            {q.scenario && <p className="question-scenario">{q.scenario}</p>}
            <p className="question-stem">{q.stem}</p>

            <div className="question-options">
              {Object.entries(q.options || {}).map(([letter, text]) => {
                const isSelected = selected === letter;
                const isCorrectOption = q.correct_answer === letter;
                let optionClass = 'option';
                if (submitted) {
                  if (isCorrectOption) optionClass += ' correct-option';
                  else if (isSelected && !isCorrectOption) optionClass += ' wrong-option';
                } else if (isSelected) {
                  optionClass += ' selected-option';
                }

                return (
                  <button
                    key={letter}
                    className={optionClass}
                    onClick={() => handleSelect(qIndex, letter)}
                    disabled={submitted}
                  >
                    <span className="option-letter">{letter}</span>
                    <span className="option-text">{text}</span>
                  </button>
                );
              })}
            </div>

            {submitted && (
              <div className="question-explanation">
                <div className="explanation-header">Explanation</div>
                <p>{q.explanation}</p>
                {q.distractors && isWrong && selected && q.distractors[selected] && (
                  <div className="distractor-explanation">
                    <strong>Why {selected} is wrong:</strong> {q.distractors[selected]}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!submitted && timerStarted && (
        <button
          className="submit-quiz-btn"
          onClick={handleSubmit}
          disabled={!allAnswered}
        >
          {allAnswered ? 'Submit Answers' : `Answer all questions (${Object.keys(answers).length}/${questions.length})`}
        </button>
      )}
    </div>
  );
}

export default QuizMode;
