import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function ResultsDisplay({ results }) {
  const [activeTab, setActiveTab] = useState('markdown');
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="results">
      <div className="results-header">
        <h2>Generated Assessment</h2>
        <div className="results-actions">
          <button
            className="action-btn"
            onClick={() => handleCopy(
              activeTab === 'markdown' ? results.markdown_output : JSON.stringify(results.json_output, null, 2)
            )}
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
        <button
          className={`tab ${activeTab === 'markdown' ? 'active' : ''}`}
          onClick={() => setActiveTab('markdown')}
        >
          Formatted View
        </button>
        <button
          className={`tab ${activeTab === 'json' ? 'active' : ''}`}
          onClick={() => setActiveTab('json')}
        >
          JSON Output
        </button>
      </div>

      <div className="results-content">
        {activeTab === 'markdown' ? (
          <div className="markdown-view">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {results.markdown_output}
            </ReactMarkdown>
          </div>
        ) : (
          <pre className="json-view">
            {JSON.stringify(results.json_output, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

export default ResultsDisplay;
