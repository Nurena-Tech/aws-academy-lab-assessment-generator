# AWS Academy Lab & Assessment Generator

> An AI-powered web application that generates complementary hands-on labs, certification exam prep questions, and grading rubrics for AWS Academy course modules — designed for educators who need additional practice materials that align with course content and AWS certifications.

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
| **Exam Prep MCQs** | Scenario-based multiple choice questions aligned to the module topics and certification domains, with distractor analysis |
| **Grading Rubric** | Criteria-based rubric with 4 performance levels and point allocations |

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

```
Educator Browser → CloudFront → S3 (React frontend)
                 → API Gateway → Lambda (FastAPI) → Bedrock (Claude Sonnet 4.6)
                                                  → Canvas LMS API (module data)
                                                  → S3 (job results)
```

### AWS Services Used

| Service | Purpose |
|---------|---------|
| **S3** | Hosts React frontend + stores async job results |
| **CloudFront** | CDN for the web app |
| **API Gateway (HTTP)** | Routes API requests to Lambda |
| **Lambda** | Runs FastAPI backend + async worker for AI generation |
| **Amazon Bedrock** | Claude Sonnet 4.6 for content generation |
| **IAM** | Least-privilege role for Lambda |
| **CloudFormation** | Infrastructure as code |

### Async Pattern

Since content generation takes 60-90 seconds (exceeding API Gateway's 30s timeout):
1. `POST /api/generate` → stores "processing" status in S3, invokes a worker Lambda asynchronously, returns job ID immediately
2. Worker Lambda calls Bedrock, writes results to S3
3. Frontend polls `GET /api/results/{job_id}` every 5 seconds until complete

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
- History of generated content with versioning
- Collaborative review workflow for generated materials

---

## Author

Built by **Nureni Adeyemo** — AWS Academy team
