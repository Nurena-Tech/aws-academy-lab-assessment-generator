# AWS Academy LabForge

> Lab and Assessment Generator for AWS Certification Prep

An AI-powered web application that generates complementary hands-on labs, certification exam prep questions, and grading rubrics for AWS Academy course modules — designed for educators who need additional practice materials that align with course content and AWS certifications.

---

## The Problem

AWS Academy educators often need supplementary lab exercises and assessment materials that:
- Complement (not duplicate) the labs already built into each course module
- Align with the AWS certification exams the courses prepare students for
- Work within the constraints of the AWS Academy Learner Lab sandbox environment
- Cover module concepts from different angles and real-world scenarios

Creating these materials manually requires deep knowledge of Learner Lab restrictions (IAM limitations, instance type limits, available services) and careful alignment to certification exam domains — a time-consuming process that this tool automates.

---

## What It Does

1. **Select a course and module** — Choose from AWS Academy Cloud Foundations or Cloud Architecting, then pick a specific module
2. **Auto-loads module context** — Pulls topics and existing labs from Canvas LMS in real time
3. **Generates complementary content** — AI creates materials that cover the same concepts but from different scenarios, avoiding duplication
4. **Respects Learner Lab constraints** — All generated labs use LabRole, LabInstanceProfile, supported instance types, and available services only
5. **Aligns to certifications** — ACF labs map to Cloud Practitioner (CLF-C02) domains; ACA labs map to Solutions Architect Associate (SAA-C03) domains

### Generated Outputs

| Output | Description |
|--------|-------------|
| **Hands-On Lab** | Scenario-based lab with step-by-step instructions, verification steps, cleanup, and troubleshooting — all within Learner Lab restrictions |
| **Exam Prep MCQs** | Scenario-based multiple choice questions with difficulty calibrated to certification level (Foundational vs Associate), with distractor analysis |
| **Interactive Practice Quiz** | Students take MCQs in real exam format — answer all questions, submit, then see score with per-question explanations |
| **Grading Rubric** | Criteria-based rubric with 4 performance levels and point allocations (tied to lab output) |

### Key Features

- **Dynamic button** — Generate button text reflects selected options (Lab, MCQs, Rubric)
- **Certification-calibrated difficulty** — Cloud Practitioner MCQs test concepts/definitions; Solutions Architect MCQs test architectural design and trade-offs
- **Course-specific time limits** — Cloud Foundations labs: 30 min max; Cloud Architecting labs: 60 min max
- **Timed exam simulation** — Quiz timer based on actual AWS exam pacing (CLF-C02: 83 sec/question; SAA-C03: 120 sec/question) with option for untimed mode
- **Adaptive difficulty** — Suggests harder questions for perfect scores, review questions for low scores
- **Progress tracking** — Saves quiz scores per module in browser localStorage; shows historical performance chart across attempts
- **Parallel generation** — MCQs and Lab are generated simultaneously for faster results
- **Streaming partial results** — MCQs appear immediately while lab continues generating in the background
- **Fast MCQ generation** — MCQs use Claude Haiku for ~1 minute response time
- **Answer Key gating** — Answer Key is hidden until the learner completes the practice quiz
- **Inline lab editing** — Edit lab title, scenario, and step instructions directly in the browser before downloading
- **Word document export** — Download generated labs as formatted .docx files (edits included)
- **Separate result views** — Dedicated tabs for Practice Quiz, Answer Key, and Lab Instructions (with per-tab download buttons)

---

## Course & Certification Alignment

| AWS Academy Course | Certification | Exam Code |
|-------------------|---------------|-----------|
| AWS Academy Cloud Foundations | AWS Certified Cloud Practitioner | CLF-C02 |
| AWS Academy Cloud Architecting | AWS Certified Solutions Architect - Associate | SAA-C03 |

---

## Learner Lab Constraints (Built In)

All generated labs automatically respect these restrictions:

- **IAM:** Uses pre-configured `LabRole` and `LabInstanceProfile` — never creates IAM roles/users/policies
- **EC2:** Instance types limited to nano, micro, small, medium, large; uses `vockey` key pair in us-east-1
- **RDS:** Burstable classes only (nano-medium), gp2 storage, no Enhanced Monitoring
- **Lambda:** Uses LabRole as execution role, max 10 concurrent environments
- **Region:** Limited to us-east-1 and us-west-2
- **Budget:** Cleanup steps included to preserve student budgets
- **61 available services** — labs only use services accessible in the Learner Lab sandbox

---

## Architecture

![AWS Academy LabForge Architecture](AWS%20Academy%20Lab%20%26%20Assessment%20Generator%20Architecture.png)

### AWS Services Used

| Service | Purpose |
|---------|---------|
| **S3** | Hosts React frontend + stores async job results |
| **CloudFront** | CDN for the web app with origin secret header verification |
| **API Gateway (HTTP)** | Routes API requests to Lambda (throttled: 5 req/s, burst 10) |
| **Lambda** | Runs FastAPI backend + async worker for AI generation |
| **Amazon Bedrock** | Claude Sonnet 4.6 for lab generation, Claude Haiku 4.5 for fast MCQ generation |
| **SSM Parameter Store** | Stores Canvas API token as SecureString (encrypted at rest) |
| **IAM** | Least-privilege role for Lambda |
| **CloudFormation** | Infrastructure as code |

### Security

- **Origin verification** — API Gateway rejects direct requests; only CloudFront-routed traffic is accepted (via `X-Origin-Verify` secret header)
- **CORS locked** — Only the CloudFront domain is allowed (not `*`)
- **Canvas token in SSM** — Canvas API token stored as SSM Parameter Store SecureString (`/lab-assessment-generator/canvas-api-token`), encrypted at rest with KMS; Lambda retrieves it at runtime with `WithDecryption=True`
- **API throttling** — API Gateway rate limited to 5 requests/second with burst of 10 to prevent abuse
- **No credentials in code** — Local dev uses `.env` file (gitignored); production uses SSM

### Async Pattern

Since content generation takes up to 2 minutes (exceeding API Gateway's 30s timeout):
1. `POST /api/generate` → stores "processing" status in S3, invokes a worker Lambda asynchronously, returns job ID immediately
2. Worker Lambda calls Bedrock (Lab + MCQs in parallel threads when both are requested), writes results to S3
3. Frontend polls `GET /api/results/{job_id}` every 2.5 seconds; displays partial results (MCQs) as soon as available while lab continues generating

---

## Getting Started

### Prerequisites

- AWS account with Bedrock access (Claude Sonnet 4.6 enabled in us-west-2)
- Canvas LMS API token (for fetching course modules)
- Node.js 18+ and Python 3.12+

### Local Development

```bash
# Configure credentials
cp .env.example .env
# Edit .env with your Canvas token and AWS profile

# Run locally
bash run-local.sh
# Backend: http://localhost:8000
# Frontend: http://localhost:3000
```

### Deploy to AWS

```bash
bash deploy.sh
```

This deploys the full stack: CloudFormation infrastructure, Lambda code, React frontend to S3, and invalidates CloudFront.

### Get the App URL

```bash
aws cloudformation describe-stacks --stack-name lab-assessment-generator --region us-west-2 --profile $AWS_PROFILE --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' --output text --no-cli-pager
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/courses` | List available AWS Academy courses |
| GET | `/api/courses/{id}/modules` | List modules for a course (live from Canvas) |
| POST | `/api/generate` | Start async generation, returns job ID |
| GET | `/api/results/{job_id}` | Poll for generation results |

---

## Adding New Courses

To add another AWS Academy course, update `backend/courses.py`:

```python
COURSES = {
    "64807": {
        "name": "AWS Academy Cloud Foundations",
        "short_name": "ACF",
        "certification": "CLF-C02",
        "certification_name": "AWS Certified Cloud Practitioner",
    },
    "77006": {
        "name": "AWS Academy Cloud Architecting",
        "short_name": "ACA",
        "certification": "SAA-C03",
        "certification_name": "AWS Certified Solutions Architect - Associate",
    },
    # Add new course here:
    "NEW_COURSE_ID": {
        "name": "AWS Academy Course Name",
        "short_name": "SHORT",
        "certification": "EXAM-CODE",
        "certification_name": "Full Certification Name",
    },
}
```

Modules are fetched live from Canvas — no additional configuration needed.

---

## Future Enhancements

- Add more AWS Academy courses (Cloud Developing, Data Engineering, Machine Learning)
- Export to Canvas-compatible formats (QTI for quizzes)
- Lab difficulty levels (introductory, intermediate, advanced)
- Batch generation for entire courses
- Cloud-based progress tracking with educator dashboards (DynamoDB + authentication)
- Question bank to avoid duplicate generation and enable mix-and-match assessments
- Collaborative review workflow for generated materials
- Canvas LMS course creation with AI-generated video content

---

## Author

Built by **Nureni Adeyemo** — AWS Academy team
