"""Converts JSON assessment output to formatted Markdown."""


def format_as_markdown(data):
    """Convert assessment JSON to readable Markdown."""
    lines = []

    lines.append(f"# Assessment: {data.get('learning_objective', 'Untitled')}")
    lines.append(f"**Certification:** {data.get('certification', 'N/A')}")
    lines.append("")

    # Domain Alignment
    alignment = data.get("domain_alignment", {})
    if alignment:
        lines.append("## Certification Domain Alignment")
        lines.append(f"**Primary Domain:** {alignment.get('primary_domain', 'N/A')}")
        lines.append(f"**Relevance:** {alignment.get('relevance', 'N/A')}")
        lines.append("")

    # Multiple Choice Questions
    questions = data.get("multiple_choice_questions", [])
    if questions:
        lines.append("## Multiple Choice Questions")
        lines.append("")
        for q in questions:
            lines.append(f"### Question {q.get('question_number', '?')}")
            if q.get("scenario"):
                lines.append(f"*Scenario:* {q['scenario']}")
                lines.append("")
            lines.append(f"**{q.get('stem', '')}**")
            lines.append("")
            options = q.get("options", {})
            for letter, text in options.items():
                lines.append(f"- **{letter}.** {text}")
            lines.append("")
            lines.append(f"**Correct Answer:** {q.get('correct_answer', '?')}")
            lines.append(f"**Explanation:** {q.get('explanation', '')}")
            lines.append("")

            distractors = q.get("distractors", {})
            if distractors:
                lines.append("**Distractor Analysis:**")
                for letter, misconception in distractors.items():
                    lines.append(f"- **{letter}:** {misconception}")
                lines.append("")
            lines.append("---")
            lines.append("")

    # Lab Instructions
    lab = data.get("lab_instructions", {})
    if lab and lab.get("title"):
        lines.append("## Hands-On Lab")
        lines.append(f"### {lab.get('title', 'Lab Exercise')}")
        lines.append(f"**Estimated Time:** {lab.get('estimated_time', 'N/A')}")
        lines.append("")
        lines.append(f"**Scenario:** {lab.get('scenario', '')}")
        lines.append("")

        prereqs = lab.get("prerequisites", [])
        if prereqs:
            lines.append("**Prerequisites:**")
            for p in prereqs:
                lines.append(f"- {p}")
            lines.append("")

        steps = lab.get("steps", [])
        if steps:
            lines.append("### Instructions")
            lines.append("")
            for step in steps:
                lines.append(f"**Step {step.get('step_number', '?')}: {step.get('title', '')}**")
                lines.append(f"{step.get('instructions', '')}")
                if step.get("expected_outcome"):
                    lines.append(f"> *Expected Outcome:* {step['expected_outcome']}")
                lines.append("")

        verification = lab.get("verification", [])
        if verification:
            lines.append("### Verification")
            for v in verification:
                lines.append(f"- [ ] {v}")
            lines.append("")

        cleanup = lab.get("cleanup", [])
        if cleanup:
            lines.append("### Clean-Up")
            for c in cleanup:
                lines.append(f"1. {c}")
            lines.append("")

        troubleshooting = lab.get("troubleshooting", [])
        if troubleshooting:
            lines.append("### Troubleshooting")
            for t in troubleshooting:
                lines.append(f"- **{t.get('issue', '?')}:** {t.get('solution', '')}")
            lines.append("")

    # Rubric
    rubric = data.get("rubric", {})
    if rubric and rubric.get("criteria"):
        lines.append("## Grading Rubric")
        lines.append(f"**Total Points:** {rubric.get('total_points', 'N/A')}")
        lines.append("")
        lines.append("| Criterion | Points | Excellent (4) | Proficient (3) | Developing (2) | Beginning (1) |")
        lines.append("|-----------|--------|---------------|----------------|----------------|---------------|")
        for c in rubric["criteria"]:
            lines.append(
                f"| {c.get('criterion', '')} | {c.get('points', '')} | "
                f"{c.get('excellent_4', '')} | {c.get('proficient_3', '')} | "
                f"{c.get('developing_2', '')} | {c.get('beginning_1', '')} |"
            )
        lines.append("")

    return "\n".join(lines)
