import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';

export async function exportToWord(jsonOutput) {
  const lab = jsonOutput?.lab_instructions;
  const rubric = jsonOutput?.rubric;
  const mcqs = jsonOutput?.multiple_choice_questions || [];
  const sections = [];

  // Lab section
  if (lab && lab.title) {
    sections.push(
      new Paragraph({ text: lab.title, heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ children: [new TextRun({ text: 'Estimated Time: ', bold: true }), new TextRun(lab.estimated_time || 'N/A')] }),
      new Paragraph({ children: [new TextRun({ text: 'Environment: ', bold: true }), new TextRun(lab.environment || 'AWS Academy Learner Lab')] }),
      new Paragraph({ children: [new TextRun({ text: 'Region: ', bold: true }), new TextRun(lab.region || 'us-east-1')] }),
      new Paragraph({ text: '' }),
      new Paragraph({ text: 'Scenario', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ text: lab.scenario || '' }),
      new Paragraph({ text: '' }),
    );

    if (lab.prerequisites && lab.prerequisites.length > 0) {
      sections.push(new Paragraph({ text: 'Prerequisites', heading: HeadingLevel.HEADING_2 }));
      lab.prerequisites.forEach(p => {
        sections.push(new Paragraph({ text: p, bullet: { level: 0 } }));
      });
      sections.push(new Paragraph({ text: '' }));
    }

    if (lab.steps && lab.steps.length > 0) {
      sections.push(new Paragraph({ text: 'Instructions', heading: HeadingLevel.HEADING_2 }));
      lab.steps.forEach(step => {
        sections.push(
          new Paragraph({ text: `Step ${step.step_number}: ${step.title}`, heading: HeadingLevel.HEADING_3 }),
          new Paragraph({ text: step.instructions }),
        );
        if (step.expected_outcome) {
          sections.push(new Paragraph({
            children: [new TextRun({ text: 'Expected Outcome: ', bold: true, italics: true }), new TextRun({ text: step.expected_outcome, italics: true })],
          }));
        }
        sections.push(new Paragraph({ text: '' }));
      });
    }

    if (lab.verification && lab.verification.length > 0) {
      sections.push(new Paragraph({ text: 'Verification', heading: HeadingLevel.HEADING_2 }));
      lab.verification.forEach(v => {
        sections.push(new Paragraph({ text: v, bullet: { level: 0 } }));
      });
      sections.push(new Paragraph({ text: '' }));
    }

    if (lab.cleanup && lab.cleanup.length > 0) {
      sections.push(new Paragraph({ text: 'Clean-Up', heading: HeadingLevel.HEADING_2 }));
      lab.cleanup.forEach((c, i) => {
        sections.push(new Paragraph({ text: `${i + 1}. ${c}` }));
      });
      sections.push(new Paragraph({ text: '' }));
    }

    if (lab.troubleshooting && lab.troubleshooting.length > 0) {
      sections.push(new Paragraph({ text: 'Troubleshooting', heading: HeadingLevel.HEADING_2 }));
      lab.troubleshooting.forEach(t => {
        sections.push(new Paragraph({
          children: [new TextRun({ text: `${t.issue}: `, bold: true }), new TextRun(t.solution)],
        }));
      });
      sections.push(new Paragraph({ text: '' }));
    }
  }

  // Rubric section
  if (rubric && rubric.criteria && rubric.criteria.length > 0) {
    sections.push(
      new Paragraph({ text: 'Grading Rubric', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ children: [new TextRun({ text: 'Total Points: ', bold: true }), new TextRun(String(rubric.total_points))] }),
      new Paragraph({ text: '' }),
    );

    const headerRow = new TableRow({
      children: ['Criterion', 'Points', 'Excellent (4)', 'Proficient (3)', 'Developing (2)', 'Beginning (1)'].map(h =>
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })], width: { size: 1500, type: WidthType.DXA } })
      ),
    });

    const dataRows = rubric.criteria.map(c =>
      new TableRow({
        children: [c.criterion, String(c.points), c.excellent_4, c.proficient_3, c.developing_2, c.beginning_1].map(val =>
          new TableCell({ children: [new Paragraph({ text: val || '' })], width: { size: 1500, type: WidthType.DXA } })
        ),
      })
    );

    sections.push(new Table({ rows: [headerRow, ...dataRows] }));
    sections.push(new Paragraph({ text: '' }));
  }

  // MCQs section
  if (mcqs.length > 0) {
    sections.push(new Paragraph({ text: 'Multiple Choice Questions', heading: HeadingLevel.HEADING_1 }));
    sections.push(new Paragraph({ text: '' }));

    mcqs.forEach((q, i) => {
      sections.push(new Paragraph({ text: `Question ${q.question_number || i + 1}`, heading: HeadingLevel.HEADING_3 }));
      if (q.scenario) {
        sections.push(new Paragraph({ children: [new TextRun({ text: 'Scenario: ', italics: true }), new TextRun({ text: q.scenario, italics: true })] }));
      }
      sections.push(new Paragraph({ children: [new TextRun({ text: q.stem, bold: true })] }));
      sections.push(new Paragraph({ text: '' }));

      Object.entries(q.options || {}).forEach(([letter, text]) => {
        const isCorrect = letter === q.correct_answer;
        sections.push(new Paragraph({
          children: [new TextRun({ text: `${letter}. ${text}`, bold: isCorrect })],
        }));
      });

      sections.push(new Paragraph({ text: '' }));
      sections.push(new Paragraph({ children: [new TextRun({ text: 'Correct Answer: ', bold: true }), new TextRun(q.correct_answer)] }));
      sections.push(new Paragraph({ children: [new TextRun({ text: 'Explanation: ', bold: true }), new TextRun(q.explanation || '')] }));
      sections.push(new Paragraph({ text: '' }));
    });
  }

  const doc = new Document({
    sections: [{ children: sections }],
  });

  const blob = await Packer.toBlob(doc);
  const filename = lab ? `${lab.title || 'assessment'}.docx` : 'assessment.docx';
  saveAs(blob, filename);
}
