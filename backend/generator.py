"""Core generator — uses Claude to produce labs, assessments, and rubrics from learning objectives."""

import os
import json
import re
import anthropic

BEDROCK_MODEL = "us.anthropic.claude-sonnet-4-6"
BEDROCK_MODEL_FAST = "us.anthropic.claude-haiku-4-5-20251001-v1:0"


def _parse_json_response(response_text, error_msg="Failed to parse response"):
    """Extract JSON from Claude's response using multiple strategies."""
    # Strategy 1: Find JSON object in markdown code block
    code_block = re.search(r'```(?:json)?\s*(\{.+\})\s*```', response_text, re.DOTALL)
    if code_block:
        try:
            return json.loads(code_block.group(1))
        except json.JSONDecodeError:
            pass

    # Strategy 1b: Code block content missing outer braces — wrap and retry
    code_block_any = re.search(r'```(?:json)?\s*(.+?)\s*```', response_text, re.DOTALL)
    if code_block_any:
        content = code_block_any.group(1).strip()
        if not content.startswith("{"):
            content = "{" + content + "}"
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            cleaned = re.sub(r',\s*}', '}', content)
            cleaned = re.sub(r',\s*]', ']', cleaned)
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                pass

    # Strategy 2: Try wrapping if response starts with a bare key (no leading brace)
    stripped = response_text.strip()
    if stripped.startswith('"') and not stripped.startswith('{'):
        try:
            return json.loads("{" + stripped + "}")
        except json.JSONDecodeError:
            cleaned = re.sub(r',\s*}', '}', "{" + stripped + "}")
            cleaned = re.sub(r',\s*]', ']', cleaned)
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                pass

    # Strategy 3: Find outermost braces (first { to last })
    start = response_text.find("{")
    end = response_text.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(response_text[start:end])
        except json.JSONDecodeError:
            pass

        # Strategy 3b: Clean trailing commas and retry
        cleaned = re.sub(r',\s*}', '}', response_text[start:end])
        cleaned = re.sub(r',\s*]', ']', cleaned)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass

    return {"error": error_msg, "raw_response": response_text[:2000]}

SYSTEM_PROMPT = """You are an expert AWS Academy instructional designer and assessment author. You create high-quality, scenario-based lab instructions, quiz questions, rubrics, and assessment materials aligned to AWS certification exam domains.

You understand:
- AWS Cloud Practitioner (CLF-C02) exam domains and objectives
- AWS Solutions Architect Associate (SAA-C03) exam domains and objectives
- Bloom's Taxonomy levels for writing learning objectives
- Best practices for hands-on lab design (clear steps, expected outcomes, troubleshooting hints)
- How to write effective multiple-choice distractors based on common student misconceptions
- Rubric design for hands-on assessments (criteria, performance levels, point allocations)

CRITICAL — AWS ACADEMY LEARNER LAB CONSTRAINTS:
All labs run in the AWS Academy Learner Lab, a restricted sandbox environment. You MUST design labs that work within these restrictions:

1. IAM RESTRICTIONS:
   - Students CANNOT create, modify, or delete IAM users, groups, roles, or policies
   - Students CAN create service-linked roles (if a service needs one, retry if it fails first time)
   - A pre-configured role named "LabRole" exists — use it whenever a service needs a role
   - An instance profile named "LabInstanceProfile" exists — use it for EC2 instances
   - For EKS, use the pre-configured "LabEksClusterRole" for cluster and node roles
   - LabRole grants access to most AWS services (S3, DynamoDB, Lambda, EC2, RDS, CloudWatch, etc.)
   - When creating Lambda functions, attach "LabRole" as the execution role
   - When creating ECS tasks, set LabRole as both task role and task execution role
   - For Elastic Beanstalk, set Service role to LabRole and IAM instance profile to LabInstanceProfile

2. EC2 RESTRICTIONS:
   - Supported instance types: nano, micro, small, medium, and large ONLY
   - Maximum 9 concurrently running instances in us-east-1
   - Maximum 32 vCPU across all running instances per region
   - On-Demand instances only (no Spot, no Reserved)
   - EBS volumes: max 100GB, types gp2, gp3, sc1, or standard only (no PIOPS)
   - Use key pair "vockey" in us-east-1; create a new key pair in other regions
   - EC2 Fleet is NOT supported
   - Attach LabInstanceProfile to instances that need to access other AWS services or use Session Manager
   - ALWAYS recommend t2.micro or t3.micro unless the lab specifically needs more

3. RDS RESTRICTIONS:
   - Supported instance types: nano, micro, small, and medium (Burstable classes)
   - Supported engines: Aurora (Provisioned), Oracle, Microsoft SQL, MySQL, PostgreSQL, MariaDB
   - Max storage: 100GB, type gp2 only (no PIOPS)
   - On-Demand only
   - Enhanced monitoring NOT supported (must uncheck this default)
   - Tip: Stop instances when not needed; AWS auto-restarts stopped RDS after 7 days

4. LAMBDA RESTRICTIONS:
   - Attach LabRole to any function that needs to interact with other AWS services
   - Maximum 10 concurrent running Lambda execution environments

5. SAGEMAKER RESTRICTIONS:
   - Supported instance types: ml.t3.medium, ml.t3.large, ml.t3.xlarge, ml.m5.large, ml.m5.xlarge, ml.c5.large, ml.c5.xlarge only
   - Maximum 2 notebook instances, maximum 2 apps
   - Use LabRole as the execution role

6. OTHER SERVICE RESTRICTIONS:
   - Cloud9: supported types nano through c4.xlarge; use SSH connection type
   - EMR: instance types nano through large only; use EMR_DefaultRole and EMR_EC2_DefaultRole
   - Redshift: ra3.large only, maximum 2 instances per cluster
   - Glue: Worker type G.1X or Standard, max 10 workers, max concurrency 1
   - Route 53: cannot register domains
   - S3 Glacier: cannot create vault locks
   - CloudTrail: cannot enable CloudWatch logging for trails
   - Kinesis Data Analytics: use "Create with custom settings" and choose LabRole
   - Kinesis Delivery Stream: use "Advanced settings" and choose existing LabRole

7. REGION AND ENVIRONMENT:
   - Access limited to us-east-1 and us-west-2 Regions only
   - AWS Marketplace is NOT available
   - Environment is persistent — data and resources survive between sessions
   - Running EC2 instances are stopped when session ends, restarted next session
   - SageMaker notebook instances are stopped but NOT restarted next session
   - Budget limits apply — students can lose all work if budget is exceeded

8. SERVICES NOT AVAILABLE (do NOT reference in labs):
   - AWS Organizations, AWS Control Tower, AWS Direct Connect, AWS Transit Gateway
   - Amazon Bedrock, Amazon Cognito, Amazon MQ, AWS Storage Gateway
   - Any service not listed as available in the Learner Lab

9. TERMINAL ACCESS:
   - AWS CloudShell is available (has AWS CLI and Python/boto3 pre-installed)
   - EC2 Instance Connect works for Linux instances
   - Systems Manager Session Manager works if LabInstanceProfile is attached to the instance
   - For SSH in us-east-1, use the "vockey" key pair

You always produce content that is:
- Technically accurate and current with AWS best practices
- Appropriate for the specified certification level
- Scenario-based and practical (not just recall questions)
- Compatible with Learner Lab restrictions (uses LabRole, stays within available services)
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


def generate_assessment(course_name, certification, certification_name, module_name,
                        module_topics=None, existing_labs=None, learning_objective="",
                        num_mcq=0, include_lab=True, include_rubric=True):
    """Generate a complete assessment package for a course module."""
    client = get_client()
    model = get_model(client)

    cert_info = CERTIFICATION_DOMAINS.get(certification, CERTIFICATION_DOMAINS["CLF-C02"])
    lab_time_target = "60 minutes" if certification == "SAA-C03" else "30 minutes"

    if certification == "CLF-C02":
        mcq_difficulty = """DIFFICULTY LEVEL: FOUNDATIONAL (Cloud Practitioner)
- Questions should test understanding of concepts, definitions, and high-level use cases
- Focus on "what" and "why" — not deep implementation details
- Scenarios should be straightforward, single-service or simple comparisons
- Avoid multi-step architectural decisions or complex troubleshooting
- Bloom's Taxonomy levels: Remember, Understand, and basic Apply
- Example stems: "Which AWS service...", "What is the primary benefit of...", "A company wants to... Which service should they use?"
- Distractors should target common confusion between similar services or basic misunderstandings"""
    else:
        mcq_difficulty = """DIFFICULTY LEVEL: ASSOCIATE (Solutions Architect)
- Questions should test the ability to design, evaluate, and troubleshoot architectures
- Focus on "how" — selecting appropriate services, configurations, and trade-offs
- Scenarios should involve multiple services, constraints, and requirements
- Include questions requiring analysis of architecture diagrams or multi-step reasoning
- Bloom's Taxonomy levels: Apply, Analyze, and Evaluate
- Example stems: "A company needs a highly available architecture that... Which combination of services...", "An architect must reduce latency while maintaining... What should they recommend?"
- Distractors should represent valid AWS services/approaches that don't meet all the stated requirements"""
    domains_text = "\n".join(f"  - {d}" for d in cert_info["domains"])
    topics_text = "\n".join(f"  - {t}" for t in (module_topics or []))
    existing_labs_text = "\n".join(f"  - {l}" for l in (existing_labs or []))

    prompt = f"""Generate a COMPLEMENTARY lab and assessment for the following AWS Academy course module.

## Course
{course_name}

## Module
{module_name}

## Topics Covered in This Module
{topics_text if topics_text else "  (No specific topics listed)"}

## Existing Labs Already in This Module (DO NOT duplicate these)
{existing_labs_text if existing_labs_text else "  (No existing labs)"}

## Aligned Certification
{certification_name} ({certification})
Exam Domains:
{domains_text}

{"## Additional Learning Objective Focus" if learning_objective else ""}
{learning_objective if learning_objective else ""}

## IMPORTANT INSTRUCTIONS
- Generate a lab that COMPLEMENTS the existing labs listed above — it must be DIFFERENT but cover the same module concepts from a different angle or scenario.
- The lab should reinforce concepts taught in this module AND help prepare students for the aligned certification exam.
- If existing labs focus on basic setup, create a lab that focuses on a more advanced scenario, troubleshooting, or a different use case of the same services.
- If no existing labs are listed, create a foundational hands-on lab for the module topics.

## Required Outputs

Generate ALL of the following in a single JSON response:

### 1. Certification Domain Alignment
Map this objective to the most relevant exam domain(s) and explain why.

{"### 2. Hands-On Lab Instructions (PRIMARY OUTPUT)" if include_lab else "### 2. Hands-On Lab Instructions: DO NOT GENERATE. Set lab_instructions to null in the JSON response."}
{'''Generate a complete scenario-based lab with:
- Scenario context (real-world situation)
- Prerequisites (always include: AWS Academy Learner Lab active session)
- Step-by-step instructions (numbered, clear, specific)
- IMPORTANT: Use the pre-configured "LabRole" whenever a service needs an IAM role (EC2 instance profile, Lambda execution role, ECS task role, etc.). Do NOT include steps to create IAM roles or policies.
- Only use services available in the Learner Lab (see system instructions)
- Use t2.micro or t3.micro for EC2 instances
- Expected outcomes at each major step
- Verification steps (how students confirm success)
- Clean-up instructions (terminate instances, delete resources to stay within budget)
- Troubleshooting tips for common issues
- Estimated completion time: MUST NOT exceed ''' + lab_time_target + '''. Design a focused, concise lab that fits within this strict time limit.''' if include_lab else ""}

{"### 3. Multiple Choice Questions (" + str(num_mcq) + " questions)" if num_mcq > 0 else "### 3. Multiple Choice Questions: DO NOT GENERATE. Set multiple_choice_questions to an empty array [] in the JSON response."}
{'''For each question:
''' + mcq_difficulty + '''
- Questions MUST be based on the topics covered in this specific module
- Questions should help students prepare for the aligned certification exam
- Use scenario-based stems relevant to the module topics (not just factual recall)
- Cover different topics within the module across the questions (don't repeat the same topic)
- 4 answer options (A, B, C, D)
- The correct answer
- Explanation of why the correct answer is right and how it relates to the certification exam
- For each distractor: explain the common misconception it targets (based on what students commonly get wrong in this module)''' if num_mcq > 0 else ""}

{"### 4. Grading Rubric" if include_rubric else "### 4. Grading Rubric: DO NOT GENERATE. Set rubric to null in the JSON response."}
{'''Generate a rubric with:
- 3-5 grading criteria
- Performance levels: Excellent (4), Proficient (3), Developing (2), Beginning (1)
- Point allocation per criterion
- Total points possible
- Specific observable behaviors for each level''' if include_rubric else ""}

Respond ONLY with valid JSON in this exact structure:
{{
  "learning_objective": "{learning_objective}",
  "certification": "{certification}",
  "domain_alignment": {{
    "primary_domain": "Domain X: ...",
    "relevance": "Explanation of alignment"
  }},
  "lab_instructions": {{
    "title": "...",
    "scenario": "...",
    "estimated_time": "XX minutes",
    "environment": "AWS Academy Learner Lab",
    "region": "us-east-1",
    "iam_role": "LabRole (pre-configured — do NOT create new roles)",
    "instance_profile": "LabInstanceProfile (pre-configured — use for EC2)",
    "prerequisites": ["Active AWS Academy Learner Lab session", "..."],
    "steps": [
      {{
        "step_number": 1,
        "title": "...",
        "instructions": "Detailed step instructions. When attaching roles, always use LabRole. For EC2 instance profiles, use LabInstanceProfile. Use t2.micro or t3.micro instance types.",
        "expected_outcome": "What the student should see after completing this step"
      }}
    ],
    "verification": ["How to confirm the lab was completed successfully"],
    "cleanup": ["Steps to delete/terminate resources to preserve budget"],
    "troubleshooting": [
      {{
        "issue": "Common problem students may encounter",
        "solution": "How to resolve it within Learner Lab constraints"
      }}
    ]
  }},
  "multiple_choice_questions": [],
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
}}

IMPORTANT REMINDERS:
- The lab MUST work within the AWS Academy Learner Lab restrictions.
- NEVER include steps to create IAM roles, users, groups, or policies. Always use the pre-configured LabRole and LabInstanceProfile.
- EC2 instances: use t2.micro or t3.micro, key pair "vockey" in us-east-1, LabInstanceProfile for the IAM role.
- Lambda functions: attach LabRole as the execution role.
- ECS tasks: set LabRole as both task role and task execution role.
- RDS: use nano, micro, small, or medium (Burstable classes), uncheck Enhanced Monitoring, gp2 storage only.
- Region: us-east-1 (default) or us-west-2 only.
- If MCQs are skipped (num_mcq=0), set "multiple_choice_questions" to an empty array [].
- If rubric is skipped, set "rubric" to {{}}.
- Include budget-preservation tips in cleanup steps."""

    message = client.messages.create(
        model=model,
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt + "\n\nIMPORTANT: Respond with ONLY the raw JSON object. Do NOT wrap it in markdown code blocks. Do NOT include any text before or after the JSON. Start your response with { and end with }."}],
    )

    response_text = message.content[0].text
    return _parse_json_response(response_text, "Failed to parse response")


def generate_mcqs_only(course_name, certification, certification_name, module_name,
                       module_topics=None, learning_objective="", num_mcq=5):
    """Generate MCQs using a faster model for quicker response times."""
    client = get_client()
    if isinstance(client, anthropic.AnthropicBedrock):
        model = BEDROCK_MODEL_FAST
    else:
        model = "claude-haiku-4-5-20251001"

    cert_info = CERTIFICATION_DOMAINS.get(certification, CERTIFICATION_DOMAINS["CLF-C02"])
    domains_text = "\n".join(f"  - {d}" for d in cert_info["domains"])
    topics_text = "\n".join(f"  - {t}" for t in (module_topics or []))

    if certification == "CLF-C02":
        mcq_difficulty = """DIFFICULTY LEVEL: FOUNDATIONAL (Cloud Practitioner)
- Questions should test understanding of concepts, definitions, and high-level use cases
- Focus on "what" and "why" — not deep implementation details
- Scenarios should be straightforward, single-service or simple comparisons
- Avoid multi-step architectural decisions or complex troubleshooting
- Bloom's Taxonomy levels: Remember, Understand, and basic Apply
- Example stems: "Which AWS service...", "What is the primary benefit of...", "A company wants to... Which service should they use?"
- Distractors should target common confusion between similar services or basic misunderstandings"""
    else:
        mcq_difficulty = """DIFFICULTY LEVEL: ASSOCIATE (Solutions Architect)
- Questions should test the ability to design, evaluate, and troubleshoot architectures
- Focus on "how" — selecting appropriate services, configurations, and trade-offs
- Scenarios should involve multiple services, constraints, and requirements
- Include questions requiring analysis of architecture diagrams or multi-step reasoning
- Bloom's Taxonomy levels: Apply, Analyze, and Evaluate
- Example stems: "A company needs a highly available architecture that... Which combination of services...", "An architect must reduce latency while maintaining... What should they recommend?"
- Distractors should represent valid AWS services/approaches that don't meet all the stated requirements"""

    prompt = f"""Generate {num_mcq} multiple choice questions for the following AWS Academy course module.

## Course
{course_name}

## Module
{module_name}

## Topics Covered
{topics_text if topics_text else "  (No specific topics listed)"}

## Aligned Certification
{certification_name} ({certification})
Exam Domains:
{domains_text}

{"## Additional Focus: " + learning_objective if learning_objective else ""}

## Requirements
{mcq_difficulty}

For each question generate:
- A scenario (real-world context)
- A question stem
- 4 options (A, B, C, D)
- The correct answer letter
- Explanation of why it's correct
- For each distractor: the misconception it targets

Respond ONLY with valid JSON:
{{
  "multiple_choice_questions": [
    {{
      "question_number": 1,
      "scenario": "...",
      "stem": "...",
      "options": {{"A": "...", "B": "...", "C": "...", "D": "..."}},
      "correct_answer": "A",
      "explanation": "...",
      "distractors": {{"B": "...", "C": "...", "D": "..."}}
    }}
  ]
}}"""

    message = client.messages.create(
        model=model,
        max_tokens=8000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt + "\n\nIMPORTANT: Respond with ONLY the raw JSON object. Do NOT wrap it in markdown code blocks. Do NOT include any text before or after the JSON. Start your response with { and end with }."}],
    )

    response_text = message.content[0].text
    return _parse_json_response(response_text, "Failed to parse MCQ response")
