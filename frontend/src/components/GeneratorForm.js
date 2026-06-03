import React, { useState, useEffect } from 'react';

const API_URL = process.env.REACT_APP_API_URL || '';

function GeneratorForm({ onGenerate, loading }) {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [modules, setModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [loadingModules, setLoadingModules] = useState(false);
  const [objective, setObjective] = useState('');
  const [includeLab, setIncludeLab] = useState(true);
  const [includeMcq, setIncludeMcq] = useState(false);
  const [numMcq, setNumMcq] = useState(5);
  const [includeRubric, setIncludeRubric] = useState(true);

  // Load courses on mount
  useEffect(() => {
    fetch(`${API_URL}/api/courses`)
      .then(res => res.json())
      .then(data => {
        setCourses(data);
        if (data.length > 0) setSelectedCourse(data[0].course_id);
      })
      .catch(() => {});
  }, []);

  // Load modules when course changes
  useEffect(() => {
    if (!selectedCourse) return;
    setLoadingModules(true);
    setSelectedModule(null);
    fetch(`${API_URL}/api/courses/${selectedCourse}/modules`)
      .then(res => res.json())
      .then(data => {
        setModules(data);
        setLoadingModules(false);
      })
      .catch(() => setLoadingModules(false));
  }, [selectedCourse]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedModule) return;

    onGenerate({
      course_id: selectedCourse,
      module_name: selectedModule.name,
      module_topics: selectedModule.topics,
      existing_labs: selectedModule.existing_labs,
      learning_objective: objective,
      num_mcq: includeMcq ? numMcq : 0,
      include_lab: includeLab,
      include_rubric: includeRubric,
    });
  };

  const currentCourse = courses.find(c => c.course_id === selectedCourse);

  return (
    <form className="generator-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="course">AWS Academy Course</label>
        <select
          id="course"
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          disabled={loading}
        >
          {courses.map(c => (
            <option key={c.course_id} value={c.course_id}>
              {c.name} (aligns to {c.certification})
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="module">Course Module</label>
        {loadingModules ? (
          <p className="loading-text">Loading modules from Canvas...</p>
        ) : (
          <select
            id="module"
            value={selectedModule ? selectedModule.module_id : ''}
            onChange={(e) => {
              const mod = modules.find(m => String(m.module_id) === e.target.value);
              setSelectedModule(mod || null);
            }}
            disabled={loading || modules.length === 0}
          >
            <option value="">-- Select a module --</option>
            {modules.map(m => (
              <option key={m.module_id} value={m.module_id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedModule && (
        <div className="module-info">
          <div className="module-detail">
            <strong>Topics:</strong> {selectedModule.topics.length > 0 ? selectedModule.topics.join(', ') : 'None listed'}
          </div>
          <div className="module-detail">
            <strong>Existing Labs:</strong> {selectedModule.existing_labs.length > 0 ? selectedModule.existing_labs.join(', ') : 'None'}
          </div>
          {currentCourse && (
            <div className="module-detail">
              <strong>Certification:</strong> {currentCourse.certification_name} ({currentCourse.certification})
            </div>
          )}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="objective">Additional Focus (optional)</label>
        <textarea
          id="objective"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Optionally specify a particular skill or scenario to focus the lab on (e.g., 'Focus on troubleshooting misconfigured security groups')"
          rows={2}
          maxLength={1000}
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label>What to generate:</label>
        <div className="output-options">
          <label className="checkbox-label primary-option">
            <input
              type="checkbox"
              checked={includeLab}
              onChange={(e) => {
                setIncludeLab(e.target.checked);
                if (!e.target.checked) setIncludeRubric(false);
              }}
              disabled={loading}
            />
            Hands-On Lab (AWS Academy Learner Lab)
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeRubric}
              onChange={(e) => setIncludeRubric(e.target.checked)}
              disabled={loading || !includeLab}
            />
            Grading Rubric
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeMcq}
              onChange={(e) => setIncludeMcq(e.target.checked)}
              disabled={loading}
            />
            Multiple Choice Questions (Exam Prep)
          </label>
          {includeMcq && (
            <div className="mcq-count">
              <label htmlFor="numMcq">Number of questions:</label>
              <select
                id="numMcq"
                value={numMcq}
                onChange={(e) => setNumMcq(parseInt(e.target.value))}
                disabled={loading}
              >
                {[3, 5, 7, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <button type="submit" className="generate-btn" disabled={loading || !selectedModule || (!includeLab && !includeMcq)}>
        {loading ? 'Generating...' : `Generate ${[
          includeLab && 'Lab',
          includeMcq && 'MCQs',
          includeRubric && 'Rubric',
        ].filter(Boolean).join(' & ')}`}
      </button>
    </form>
  );
}

export default GeneratorForm;
