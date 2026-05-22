import React, { useState } from 'react';

function QuizMode({ questions, onSubmit, answersRevealed }) {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const handleSelect = (qIndex, option) => {
    if (submitted) return;
    setAnswers({ ...answers, [qIndex]: option });
  };

  const handleSubmit = () => {
    setSubmitted(true);
    if (onSubmit) onSubmit();
  };

  const handleRetry = () => {
    setAnswers({});
    setSubmitted(false);
  };

  const score = submitted
    ? questions.reduce((acc, q, i) => acc + (answers[i] === q.correct_answer ? 1 : 0), 0)
    : 0;

  const allAnswered = Object.keys(answers).length === questions.length;

  return (
    <div className="quiz-mode">
      {submitted && (
        <div className={`quiz-score ${score === questions.length ? 'perfect' : score >= questions.length * 0.7 ? 'good' : 'needs-work'}`}>
          <div className="score-text">
            Score: {score} / {questions.length} ({Math.round((score / questions.length) * 100)}%)
          </div>
          {!answersRevealed && <button className="retry-btn" onClick={handleRetry}>Retry Quiz</button>}
        </div>
      )}

      {questions.map((q, qIndex) => {
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

      {!submitted && (
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
