import React, { useState } from 'react';
import GeneratorForm from './components/GeneratorForm';
import ResultsDisplay from './components/ResultsDisplay';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

function App() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async (formData) => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      // Start generation job
      const response = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Generation failed');
      }

      const { job_id } = await response.json();

      // Poll for results
      const result = await pollForResults(job_id);
      if (result.status === 'error') {
        const errMsg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
        throw new Error(errMsg || 'Generation failed');
      }
      setResults(result);
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err.message || err.detail || JSON.stringify(err));
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const pollForResults = async (jobId) => {
    const maxAttempts = 120;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 2500));
      try {
        const response = await fetch(`${API_URL}/api/results/${jobId}`);
        if (!response.ok) continue;
        const data = await response.json();
        if (data.status === 'complete' || data.status === 'error') {
          return data;
        }
        if (data.status === 'partial') {
          setResults(data);
          setLoading(false);
        }
      } catch (e) {
        continue;
      }
    }
    throw new Error('Generation timed out after 5 minutes. Please try again.');
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>AWS Academy Lab & Assessment Generator</h1>
        <p>Generate complementary hands-on labs, exam prep questions, and rubrics from AWS Academy course modules</p>
      </header>

      <main className="app-main">
        <GeneratorForm onGenerate={handleGenerate} loading={loading} />

        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Generating assessment materials... This may take 30-60 seconds.</p>
          </div>
        )}

        {results && results.status === 'partial' && (
          <div className="partial-banner">
            <div className="spinner small"></div>
            <span>MCQs ready! Still generating lab instructions...</span>
          </div>
        )}

        {results && <ResultsDisplay results={results} />}
      </main>

      <footer className="app-footer">
        <p>Built for AWS Academy Educators | Powered by Amazon Bedrock (Claude)</p>
      </footer>
    </div>
  );
}

export default App;
