"""Core generator — uses Claude to produce labs, assessments, and rubrics from learning objectives."""

import os
import json
import anthropic

BEDROCK_MODEL = "us.anthropic.claude-sonnet-4-6"

SYSTEM_PROMPT = """You are an expert AWS Academy instructional designer and assessment author. You create high-quality, scenario-based lab instructions, quiz questions, rubrics, and assessment materials aligned to AWS certification exam domains.

You understand:
- AWS Cloud Practitioner (CLF-C02) exam domains and objectives
- AWS Solutions Architect Associate (SAA-C03) exam domains and objectives
- Bloom's Taxonomy levels for writing learning objectives
- Best practices for hands-on lab design (clear steps, expected outcomes, troubleshooting hints)
- How to write effective multiple-choice distractors based on common student misconceptions
- Rubric design for hands-on assessments (criteria, performance levels, point allocations)

You always produce content that is:
- Technically accurate and current with AWS best practices
- Appropriate for the specified certification level
- Scenario-based and practical (not just recall questions)
- Inclusive and accessible"""

CERTIFICATION_DOMAINS = {
    "CLF-C02": {
        "name": "AWS Certified Cloud Practitioner",
        "domains": [
            "Domain 1: Cloud Concepts (24%)",
            "Domain 2: Security and Compliance (30%)",
            "Domain 3: Cloud Technology and Services (34%)",
            "Domain 4: Billing, Pricing, and Support (12%)",
        ]
    },
    "SAA-C03": {
        "name": "AWS Certified Solutions Architect - Associate",
        "domains": [
            "Domain 1: Design Secure Architectures (30%)",
            "Domain 2: Design Resilient Architectures (26%)",
            "Domain 3: Design High-Performing Architectures (24%)",
            "Domain 4: Design Cost-Optimized Architectures (20%)",
        ]
    }
}


def get_client():
    """Get Claude client — Bedrock preferred, falls back to Anthropic API key."""
    if os.getenv("ANTHROPIC_API_KEY"):
        return anthropic.Anthropic()

    aws_region = os.getenv("AWS_REGION", os.getenv("AWS_REGION_NAME", "us-west-2"))

    if os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
        return anthropic.AnthropicBedrock(aws_region=aws_region)

    aws_profile = os.getenv("AWS_PROFILE", "nurena-bedrock-account")
    return anthropic.AnthropicBedrock(aws_region=aws_region, aws_profile=aws_profile)


def get_model(client):
    """Return the appropriate model ID based on client type."""
    if isinstance(client, anthropic.AnthropicBedrock):
        return BEDROCK_MODEL
    return "claude-sonnet-4-6-20250514"


def generate_assessment(learning_objective, certification="CLF-C02", num_mcq=5, include_lab=True, include_rubric=True):
    """Generate a complete assessment package from a learning objective."""
    client = get_client()
    model = get_model(client)

    cert_info = CERTIFICATION_DOMAINS.get(certification, CERTIFICATION_DOMAINS["CLF-C02"])
    domains_text = "\n".join(f"  - {d}" for d in cert_info["domains"])

    prompt = f"""Generate a complete assessment package for the following learning objective.

## Learning Objective
{learning_objective}

## Target Certification
{cert_info["name"]} ({certification})
Exam Domains:
{domains_text}

## Required Outputs

Generate ALL of the following in a single JSON response:

### 1. Certification Domain Alignment
Map this objective to the most relevant exam domain(s) and explain why.

### 2. Multiple Choice Questions ({num_mcq} questions)
For each question:
- A scenario-based stem (not just factual recall)
- 4 answer options (A, B, C, D)
- The correct answer
- Explanation of why the correct answer is right
- For each distractor: explain the common misconception it targets

### 3. Hands-On Lab Instructions
{"Generate a complete scenario-based lab with:" if include_lab else "SKIP THIS SECTION"}
- Scenario context (real-world situation)
- Prerequisites
- Step-by-step instructions (numbered, clear, specific)
- Expected outcomes at each major step
- Verification steps (how students confirm success)
- Clean-up instructions
- Troubleshooting tips for common issues
- Estimated completion time

### 4. Grading Rubric
{"Generate a rubric with:" if include_rubric else "SKIP THIS SECTION"}
- 3-5 grading criteria
- Performance levels: Excellent (4), Proficient (3), Developing (2), Beginning (1)
- Point allocation per criterion
- Total points possible
- Specific observable behaviors for each level

Respond ONLY with valid JSON in this exact structure:
{{
  "learning_objective": "{learning_objective}",
  "certification": "{certification}",
  "domain_alignment": {{
    "primary_domain": "Domain X: ...",
    "relevance": "Explanation of alignment"
  }},
  "multiple_choice_questions": [
    {{
      "question_number": 1,
      "scenario": "...",
      "stem": "...",
      "options": {{
        "A": "...",
        "B": "...",
        "C": "...",
        "D": "..."
      }},
      "correct_answer": "A|B|C|D",
      "explanation": "...",
      "distractors": {{
        "B": "Misconception: ...",
        "C": "Misconception: ...",
        "D": "Misconception: ..."
      }}
    }}
  ],
  "lab_instructions": {{
    "title": "...",
    "scenario": "...",
    "estimated_time": "XX minutes",
    "prerequisites": ["..."],
    "steps": [
      {{
        "step_number": 1,
        "title": "...",
        "instructions": "...",
        "expected_outcome": "..."
      }}
    ],
    "verification": ["..."],
    "cleanup": ["..."],
    "troubleshooting": [
      {{
        "issue": "...",
        "solution": "..."
      }}
    ]
  }},
  "rubric": {{
    "total_points": 20,
    "criteria": [
      {{
        "criterion": "...",
        "points": 5,
        "excellent_4": "...",
        "proficient_3": "...",
        "developing_2": "...",
        "beginning_1": "..."
      }}
    ]
  }}
}}"""

    message = client.messages.create(
        model=model,
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    response_text = message.content[0].text

    # Parse JSON from response
    start = response_text.find("{")
    end = response_text.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(response_text[start:end])
        except json.JSONDecodeError:
            pass

    return {"error": "Failed to parse response", "raw_response": response_text}
