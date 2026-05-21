import React, { useState } from 'react';

const EXAMPLE_OBJECTIVES = [
  "Students should be able to configure an S3 bucket policy to restrict access to specific IAM roles",
  "Students should be able to launch an EC2 instance and connect via SSH using a key pair",
  "Students should be able to explain the AWS Shared Responsibility Model and identify customer vs. AWS responsibilities",
  "Students should be able to design a highly available architecture using Auto Scaling and Elastic Load Balancing",
  "Students should be able to create a VPC with public and private subnets and configure route tables",
];

function GeneratorForm({ onGenerate, loading }) {
  const [objective, setObjective] = useState('');
  const [certification, setCertification] = useState('CLF-C02');
  const [numMcq, setNumMcq] = useState(5);
  const [includeLab, setIncludeLab] = useState(true);
  const [includeRubric, setIncludeRubric] = useState(true);

  const handleSubmit = (e) => {
    e.preventDefault();
    onGenerate({
      learning_objective: objective,
      certification,
      num_mcq: numMcq,
      include_lab: includeLab,
      include_rubric: includeRubric,
    });
  };

  const handleExample = (example) => {
    setObjective(example);
  };

  return (
    <form className="generator-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="objective">Learning Objective</label>
        <textarea
          id="objective"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Enter a learning objective (e.g., 'Students should be able to configure an S3 bucket policy')"
          rows={3}
          required
          minLength={10}
          maxLength={1000}
          disabled={loading}
        />
        <div className="examples">
          <span>Examples:</span>
          {EXAMPLE_OBJECTIVES.map((ex, i) => (
            <button
              key={i}
              type="button"
              className="example-btn"
              onClick={() => handleExample(ex)}
              disabled={loading}
            >
              {ex.substring(0, 60)}...
            </button>
          ))}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="certification">Target Certification</label>
          <select
            id="certification"
            value={certification}
            onChange={(e) => setCertification(e.target.value)}
            disabled={loading}
          >
            <option value="CLF-C02">Cloud Practitioner (CLF-C02)</option>
            <option value="SAA-C03">Solutions Architect Associate (SAA-C03)</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="numMcq">Number of MCQs</label>
          <select
            id="numMcq"
            value={numMcq}
            onChange={(e) => setNumMcq(parseInt(e.target.value))}
            disabled={loading}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row checkboxes">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={includeLab}
            onChange={(e) => setIncludeLab(e.target.checked)}
            disabled={loading}
          />
          Include Hands-On Lab
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={includeRubric}
            onChange={(e) => setIncludeRubric(e.target.checked)}
            disabled={loading}
          />
          Include Grading Rubric
        </label>
      </div>

      <button type="submit" className="generate-btn" disabled={loading || objective.length < 10}>
        {loading ? 'Generating...' : 'Generate Assessment'}
      </button>
    </form>
  );
}

export default GeneratorForm;
