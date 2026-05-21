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
      const response = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Generation failed');
      }

      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>AWS Academy Lab & Assessment Generator</h1>
        <p>Generate scenario-based labs, quiz questions, and rubrics from learning objectives</p>
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

        {results && <ResultsDisplay results={results} />}
      </main>

      <footer className="app-footer">
        <p>Built for AWS Academy Educators | Powered by Amazon Bedrock (Claude)</p>
      </footer>
    </div>
  );
}

export default App;
