import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import QuizMode from './QuizMode';

function ResultsDisplay({ results }) {
  const mcqs = results.json_output?.multiple_choice_questions || [];
  const lab = results.json_output?.lab_instructions;
  const rubric = results.json_output?.rubric;
  const hasMcqs = mcqs.length > 0;
  const hasLab = lab && lab.title;

  const defaultTab = hasMcqs ? 'quiz' : hasLab ? 'lab' : 'json';
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [copied, setCopied] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const handleCopy = (content) => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getActiveContent = () => {
    if (activeTab === 'quiz' || activeTab === 'mcqs') return results.markdown_output;
    if (activeTab === 'lab') return formatLabMarkdown(lab, rubric);
    return JSON.stringify(results.json_output, null, 2);
  };

  return (
    <div className="results">
      <div className="results-header">
        <h2>Generated Assessment</h2>
        <div className="results-actions">
          <button
            className="action-btn"
            onClick={() => handleCopy(getActiveContent())}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            className="action-btn"
            onClick={() => handleDownload(results.markdown_output, 'assessment.md', 'text/markdown')}
          >
            Download MD
          </button>
          <button
            className="action-btn"
            onClick={() => handleDownload(
              JSON.stringify(results.json_output, null, 2), 'assessment.json', 'application/json'
            )}
          >
            Download JSON
          </button>
        </div>
      </div>

      <div className="tabs">
        {hasMcqs && (
          <button
            className={`tab ${activeTab === 'quiz' ? 'active' : ''}`}
            onClick={() => setActiveTab('quiz')}
          >
            Practice Quiz
          </button>
        )}
        {hasMcqs && showAnswers && (
          <button
            className={`tab ${activeTab === 'mcqs' ? 'active' : ''}`}
            onClick={() => setActiveTab('mcqs')}
          >
            Answer Key
          </button>
        )}
        {hasLab && (
          <button
            className={`tab ${activeTab === 'lab' ? 'active' : ''}`}
            onClick={() => setActiveTab('lab')}
          >
            Lab Instructions
          </button>
        )}
        <button
          className={`tab ${activeTab === 'json' ? 'active' : ''}`}
          onClick={() => setActiveTab('json')}
        >
          JSON Output
        </button>
      </div>

      <div className="results-content">
        {activeTab === 'quiz' && (
          <div>
            <QuizMode questions={mcqs} onSubmit={() => setQuizSubmitted(true)} />
            {quizSubmitted && !showAnswers && (
              <button
                className="show-answers-btn"
                onClick={() => setShowAnswers(true)}
              >
                Show Answer Key
              </button>
            )}
          </div>
        )}
        {activeTab === 'mcqs' && (
          <div className="markdown-view">
            <McqsFormattedView questions={mcqs} />
          </div>
        )}
        {activeTab === 'lab' && (
          <div className="markdown-view">
            <LabFormattedView lab={lab} rubric={rubric} />
          </div>
        )}
        {activeTab === 'json' && (
          <pre className="json-view">
            {JSON.stringify(results.json_output, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function McqsFormattedView({ questions }) {
  return (
    <div>
      <h2>Multiple Choice Questions</h2>
      {questions.map((q, i) => (
        <div key={i} className="mcq-formatted">
          <h3>Question {q.question_number || i + 1}</h3>
          {q.scenario && <p className="mcq-scenario"><em>Scenario:</em> {q.scenario}</p>}
          <p><strong>{q.stem}</strong></p>
          <ul className="mcq-options-list">
            {Object.entries(q.options || {}).map(([letter, text]) => (
              <li key={letter} className={letter === q.correct_answer ? 'correct-answer' : ''}>
                <strong>{letter}.</strong> {text}
                {letter === q.correct_answer && <span className="answer-badge">Correct</span>}
              </li>
            ))}
          </ul>
          <div className="mcq-explanation">
            <strong>Explanation:</strong> {q.explanation}
          </div>
          {q.distractors && (
            <div className="mcq-distractors">
              <strong>Distractor Analysis:</strong>
              <ul>
                {Object.entries(q.distractors).map(([letter, text]) => (
                  <li key={letter}><strong>{letter}:</strong> {text}</li>
                ))}
              </ul>
            </div>
          )}
          <hr />
        </div>
      ))}
    </div>
  );
}

function LabFormattedView({ lab, rubric }) {
  if (!lab) return null;

  return (
    <div>
      <h2>{lab.title}</h2>
      <p><strong>Estimated Time:</strong> {lab.estimated_time}</p>
      <p><strong>Environment:</strong> {lab.environment}</p>
      <p><strong>Region:</strong> {lab.region}</p>
      <p><strong>IAM Role:</strong> {lab.iam_role}</p>

      <h3>Scenario</h3>
      <p>{lab.scenario}</p>

      {lab.prerequisites && lab.prerequisites.length > 0 && (
        <>
          <h3>Prerequisites</h3>
          <ul>
            {lab.prerequisites.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </>
      )}

      {lab.steps && lab.steps.length > 0 && (
        <>
          <h3>Instructions</h3>
          {lab.steps.map((step, i) => (
            <div key={i} className="lab-step">
              <h4>Step {step.step_number}: {step.title}</h4>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {step.instructions}
              </ReactMarkdown>
              {step.expected_outcome && (
                <blockquote>
                  <strong>Expected Outcome:</strong> {step.expected_outcome}
                </blockquote>
              )}
            </div>
          ))}
        </>
      )}

      {lab.verification && lab.verification.length > 0 && (
        <>
          <h3>Verification</h3>
          <ul>
            {lab.verification.map((v, i) => <li key={i}>{v}</li>)}
          </ul>
        </>
      )}

      {lab.cleanup && lab.cleanup.length > 0 && (
        <>
          <h3>Clean-Up</h3>
          <ol>
            {lab.cleanup.map((c, i) => <li key={i}>{c}</li>)}
          </ol>
        </>
      )}

      {lab.troubleshooting && lab.troubleshooting.length > 0 && (
        <>
          <h3>Troubleshooting</h3>
          {lab.troubleshooting.map((t, i) => (
            <div key={i} className="troubleshooting-item">
              <strong>{t.issue}:</strong> {t.solution}
            </div>
          ))}
        </>
      )}

      {rubric && rubric.criteria && rubric.criteria.length > 0 && (
        <>
          <h3>Grading Rubric</h3>
          <p><strong>Total Points:</strong> {rubric.total_points}</p>
          <table>
            <thead>
              <tr>
                <th>Criterion</th>
                <th>Points</th>
                <th>Excellent (4)</th>
                <th>Proficient (3)</th>
                <th>Developing (2)</th>
                <th>Beginning (1)</th>
              </tr>
            </thead>
            <tbody>
              {rubric.criteria.map((c, i) => (
                <tr key={i}>
                  <td>{c.criterion}</td>
                  <td>{c.points}</td>
                  <td>{c.excellent_4}</td>
                  <td>{c.proficient_3}</td>
                  <td>{c.developing_2}</td>
                  <td>{c.beginning_1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function formatLabMarkdown(lab, rubric) {
  if (!lab) return '';
  let md = `# ${lab.title}\n\n`;
  md += `**Estimated Time:** ${lab.estimated_time}\n\n`;
  md += `## Scenario\n${lab.scenario}\n\n`;
  if (lab.steps) {
    md += '## Instructions\n\n';
    lab.steps.forEach(s => {
      md += `### Step ${s.step_number}: ${s.title}\n${s.instructions}\n\n`;
    });
  }
  return md;
}

export default ResultsDisplay;
