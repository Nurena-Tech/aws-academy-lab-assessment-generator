import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import QuizMode from './QuizMode';
import { exportToWord } from '../utils/wordExport';

function ResultsDisplay({ results, moduleName }) {
  const mcqs = results.json_output?.multiple_choice_questions || [];
  const lab = results.json_output?.lab_instructions;
  const rubric = results.json_output?.rubric;
  const hasMcqs = mcqs.length > 0;
  const hasLab = lab && lab.title;

  const defaultTab = hasMcqs ? 'quiz' : hasLab ? 'lab' : 'json';
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [showAnswers, setShowAnswers] = useState(false);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [editedLab, setEditedLab] = useState(null);

  const quizModuleName = moduleName || results.json_output?.certification || 'Quiz';

  return (
    <div className="results">
      <div className="results-header">
        <h2>Generated Assessment</h2>
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
      </div>

      <div className="results-content">
        {/* Quiz - always mounted to preserve state */}
        <div style={{ display: activeTab === 'quiz' ? 'block' : 'none' }}>
          <QuizMode
            questions={mcqs}
            onSubmit={() => setQuizSubmitted(true)}
            answersRevealed={showAnswers}
            moduleName={quizModuleName}
            certification={results.json_output?.certification}
          />
          {quizSubmitted && !showAnswers && (
            <button
              className="show-answers-btn"
              onClick={() => setShowAnswers(true)}
            >
              Show Answer Key
            </button>
          )}
        </div>

        {/* Answer Key - always mounted to preserve state */}
        <div style={{ display: activeTab === 'mcqs' ? 'block' : 'none' }}>
          <div className="markdown-view">
            <McqsFormattedView questions={mcqs} />
          </div>
        </div>

        {/* Lab - always mounted to preserve edits */}
        <div style={{ display: activeTab === 'lab' ? 'block' : 'none' }}>
          {hasLab && (
            <div className="markdown-view">
              <LabFormattedView lab={lab} rubric={rubric} onLabChange={setEditedLab} />
            </div>
          )}
        </div>
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

function LabFormattedView({ lab, rubric, onLabChange }) {
  const [editing, setEditing] = useState(false);
  const [labData, setLabData] = useState(lab);
  const [copied, setCopied] = useState(false);

  if (!labData) return null;

  const updateField = (path, value) => {
    setLabData(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let obj = updated;
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      if (onLabChange) onLabChange(updated);
      return updated;
    });
  };

  const updateStep = (index, field, value) => {
    setLabData(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      updated.steps[index][field] = value;
      if (onLabChange) onLabChange(updated);
      return updated;
    });
  };

  const handleDownloadWord = () => {
    const output = { lab_instructions: labData, rubric };
    exportToWord(output);
  };

  const handleCopyMd = () => {
    const md = formatLabMarkdown(labData, rubric);
    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMd = () => {
    const md = formatLabMarkdown(labData, rubric);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${labData.title || 'lab'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="lab-toolbar">
        <button className={`edit-btn ${editing ? 'active' : ''}`} onClick={() => setEditing(!editing)}>
          {editing ? 'Done Editing' : 'Edit Lab'}
        </button>
        <div className="lab-download-actions">
          <button className="action-btn" onClick={handleCopyMd}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button className="action-btn" onClick={handleDownloadWord}>
            Download Word
          </button>
          <button className="action-btn" onClick={handleDownloadMd}>
            Download MD
          </button>
        </div>
      </div>

      {editing ? (
        <input className="edit-title" value={labData.title} onChange={e => updateField('title', e.target.value)} />
      ) : (
        <h2>{labData.title}</h2>
      )}
      <p><strong>Estimated Time:</strong> {labData.estimated_time}</p>
      <p><strong>Environment:</strong> {labData.environment}</p>
      <p><strong>Region:</strong> {labData.region}</p>
      <p><strong>IAM Role:</strong> {labData.iam_role}</p>

      <h3>Scenario</h3>
      {editing ? (
        <textarea className="edit-textarea" value={labData.scenario} onChange={e => updateField('scenario', e.target.value)} rows={4} />
      ) : (
        <p>{labData.scenario}</p>
      )}

      {labData.prerequisites && labData.prerequisites.length > 0 && (
        <>
          <h3>Prerequisites</h3>
          <ul>
            {labData.prerequisites.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </>
      )}

      {labData.steps && labData.steps.length > 0 && (
        <>
          <h3>Instructions</h3>
          {labData.steps.map((step, i) => (
            <div key={i} className="lab-step">
              {editing ? (
                <input className="edit-step-title" value={step.title} onChange={e => updateStep(i, 'title', e.target.value)} />
              ) : (
                <h4>Step {step.step_number}: {step.title}</h4>
              )}
              {editing ? (
                <textarea className="edit-textarea" value={step.instructions} onChange={e => updateStep(i, 'instructions', e.target.value)} rows={5} />
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {step.instructions}
                </ReactMarkdown>
              )}
              {step.expected_outcome && (
                editing ? (
                  <textarea className="edit-textarea small" value={step.expected_outcome} onChange={e => updateStep(i, 'expected_outcome', e.target.value)} rows={2} />
                ) : (
                  <blockquote>
                    <strong>Expected Outcome:</strong> {step.expected_outcome}
                  </blockquote>
                )
              )}
            </div>
          ))}
        </>
      )}

      {labData.verification && labData.verification.length > 0 && (
        <>
          <h3>Verification</h3>
          <ul>
            {labData.verification.map((v, i) => <li key={i}>{v}</li>)}
          </ul>
        </>
      )}

      {labData.cleanup && labData.cleanup.length > 0 && (
        <>
          <h3>Clean-Up</h3>
          <ol>
            {labData.cleanup.map((c, i) => <li key={i}>{c}</li>)}
          </ol>
        </>
      )}

      {labData.troubleshooting && labData.troubleshooting.length > 0 && (
        <>
          <h3>Troubleshooting</h3>
          {labData.troubleshooting.map((t, i) => (
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
