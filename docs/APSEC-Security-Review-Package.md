# APSEC Security Review Package
## AWS Academy LabForge (Lab & Assessment Generator)

**Submission Date:** [TBD]  
**Owner:** Nureni Adeyemo — AWS Academy Technical Trainer, NAMER  
**Review Type:** External-facing application (restricted audience)

---

## 1. Application Overview

### What is it?
AWS Academy LabForge is an AI-powered web application that generates supplementary lab instructions and certification-aligned practice exam questions for AWS Academy educators. It uses Amazon Bedrock (Claude models) to produce content that is technically accurate and compliant with AWS Academy Learner Lab constraints.

### Business Justification
- AWS Academy Technical Training staff reduced by 50% while educator base continues to grow
- Educators spend 4-8 hours manually creating a single supplementary lab that respects Learner Lab IAM/service restrictions
- This tool reduces that to ~60 seconds of automated generation
- Directly supports 2026 Global Enablement Coverage target (30%) and Active Teaching target (48% → 55%)

### User Base
- **Restricted to:** AWS Academy Educators only (approximately 15,000 globally)
- **NOT extended to:** AWS re/Start, AWS TechU, AWS Educate, or general public
- **Access control:** Currently URL-based; authentication implementation planned for AppSec submission

---

## 2. Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        End User (Educator)                       │
│                              │                                   │
│                              ▼                                   │
│                    ┌──────────────────┐                           │
│                    │   CloudFront     │  (HTTPS only)             │
│                    │   Distribution   │                           │
│                    └────────┬─────────┘                           │
│                       ┌─────┴─────┐                              │
│                       │           │                              │
│                       ▼           ▼                              │
│              ┌─────────────┐  ┌──────────────┐                   │
│              │  S3 Bucket  │  │ API Gateway  │                   │
│              │ (Frontend)  │  │   (HTTP)     │                   │
│              │  React SPA  │  └──────┬───────┘                   │
│              └─────────────┘         │                           │
│                                      ▼                           │
│                            ┌──────────────────┐                  │
│                            │  Lambda Function │                  │
│                            │  (Python 3.12)   │                  │
│                            │  FastAPI backend │                  │
│                            └────────┬─────────┘                  │
│                               ┌─────┼─────┐                     │
│                               │     │     │                     │
│                               ▼     ▼     ▼                     │
│                    ┌────────┐ ┌────┐ ┌─────────────┐            │
│                    │Bedrock │ │SSM │ │ Canvas LMS  │            │
│                    │(Claude)│ │    │ │   (Read)    │            │
│                    └────────┘ └────┘ └─────────────┘            │
│                                                                  │
│                         AWS Account                              │
└─────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Service | Purpose |
|-----------|---------|---------|
| Frontend | S3 + CloudFront | Static React SPA served via CDN |
| API Layer | API Gateway (HTTP) + Lambda | Serverless Python/FastAPI backend |
| AI Generation | Amazon Bedrock | Claude Sonnet 4.6 (labs), Claude Haiku 4.5 (MCQs) |
| Secrets | SSM Parameter Store | Canvas API token (encrypted) |
| Infrastructure | CloudFormation | IaC deployment |

### Data Flow

1. Educator opens the CloudFront URL in their browser
2. Frontend (React) renders the course selection and generation UI
3. Educator selects a course and module, then requests content generation
4. Frontend sends POST request to `/api/generate` via CloudFront → API Gateway → Lambda
5. Lambda fetches module metadata from Canvas LMS API (read-only: module names, topic titles)
6. Lambda invokes Amazon Bedrock with the module context to generate labs/MCQs
7. Generated content returned to frontend for display
8. Educator can copy, download, or use the content in their classroom

---

## 3. Security Controls (Current State)

### Network Security
- **CloudFront:** All traffic served over HTTPS; HTTP redirected to HTTPS
- **TLS:** Minimum TLSv1.2 enforced (CloudFront default certificate); origin-to-API-Gateway communication restricted to TLSv1.2 only (SSLv3 and TLSv1 removed)
- **Origin protection:** API Gateway only accepts requests with a shared secret header (`X-Origin-Verify`) set by CloudFront — blocks direct API access
- **Lambda Function URL:** Removed — no direct public endpoint to the Lambda function; all traffic routed exclusively through CloudFront → API Gateway
- **S3 buckets:** All public access blocked on all buckets; frontend bucket accessible only via CloudFront OAC (Origin Access Control)
- **API Gateway throttling:** 5 requests/sec rate limit, 10 burst limit
- **WAF:** AWS WAF WebACL attached to CloudFront distribution with AWS Managed Rules (AWSManagedRulesCommonRuleSet and AWSManagedRulesKnownBadInputsRuleSet) — currently in count mode for monitoring, to be switched to block mode after traffic baseline established
- **CORS:** Restricted to CloudFront domain only (`https://d3hzvq32kn870o.cloudfront.net`); only GET, POST, OPTIONS methods and Content-Type header allowed

### Authentication & Authorization
- **Current state:** No authentication implemented (URL-only access)
- **Planned:** [To be determined — see Gap Analysis below]

### Data Classification
- **Input data:** Course module titles and topic names from Canvas LMS (internal AWS Academy content, not student PII)
- **Output data:** AI-generated lab instructions and practice questions (derivative educational content)
- **No student data:** The tool never accesses student records, grades, submissions, or PII
- **No educator PII stored:** No user accounts, no session persistence, no usage tracking

### Secrets Management
- Canvas API token stored in SSM Parameter Store with encryption (SecureString)
- CloudFront origin secret stored as KMS-encrypted environment variable on Lambda
- Token retrieved at runtime by Lambda; cached in-memory for function lifetime only
- No secrets in source code

### IAM (Least Privilege)
- Lambda execution role follows least privilege with scoped resource ARNs:
  - `bedrock:InvokeModel` — scoped to specific model ARNs only (`us.anthropic.claude-sonnet-4-6*` and `us.anthropic.claude-haiku-4-5*` inference profiles and foundation models)
  - `s3:PutObject`, `s3:GetObject` — scoped to results bucket only (`lab-assessment-generator-results-556411750482/*`)
  - `lambda:InvokeFunction` — scoped to own function ARN only (self-invocation for async generation)
  - `ssm:GetParameter` — scoped to `/lab-assessment-generator/*` parameters only
  - `AWSLambdaBasicExecutionRole` — CloudWatch Logs
- No IAM users or access keys in the account
- All access via Isengard federated role assumption (Midway MFA)
- No IAM credentials embedded; Lambda uses execution role

### S3 Data Protection
- **Encryption:** Server-side encryption (AES-256/SSE-S3) enabled on all buckets; SSE-C blocked
- **Versioning:** Enabled on results bucket for data protection and recovery
- **Public access:** All public access block settings enabled on all buckets

### Logging & Auditing
- **CloudTrail:** Multi-region trail enabled (Isengard-managed) with log file validation
- **CloudWatch Logs:** All Lambda invocations logged with request/response metadata
- **WAF Logging:** Sampled requests and CloudWatch metrics enabled for threat monitoring
- **CloudFront access logs:** [To be enabled]
- **API Gateway access logs:** [To be enabled]

### Account Security (Isengard)
- **Account classification:** Non-Production
- **Bindle:** Imported to `AWSAcademyTechTrainersBindle` (team-owned, compliant with Isengard Bindle requirement)
- **Account access:** Admin role via Isengard federation only (no root password, no root access keys, no IAM users)
- **Audit roles:** IsengardAuditorRole, AwsSecurityAudit, CloudSecAuditRole present and active
- **CloudTrail:** Isengard-managed trail with log file validation enabled

---

## 4. Gap Analysis (Known Items to Address)

### Resolved Items (June 2026)

| Area | Previous State | Resolution |
|------|---------------|------------|
| WAF | Not deployed | ✅ AWS WAF attached with Common + KnownBadInputs managed rules (count mode) |
| TLS hardening | TLSv1/SSLv3 allowed on origin | ✅ Origin restricted to TLSv1.2 only |
| Lambda Function URL | Public, unauthenticated endpoint exposed | ✅ Deleted — all traffic via CloudFront only |
| IAM over-privilege | `bedrock:InvokeModel` on `Resource: *` | ✅ Scoped to specific model ARNs |
| S3 versioning | Disabled on results bucket | ✅ Enabled for data protection |
| CORS | Wide-open on Lambda Function URL | ✅ Removed (function URL deleted); app-level CORS restricted to CloudFront domain |
| Isengard Bindle | No Bindle resource associated | ✅ Imported to AWSAcademyTechTrainersBindle |

### Remaining Items

| Area | Current State | Required for APSEC | Priority |
|------|--------------|-------------------|----------|
| Authentication | None (open URL) | Required for external-facing app | Critical |
| Authorization | None | Role-based access (educator only) | Critical |
| User audit trail | No user identity tracked | Who generated what, when | High |
| Input validation | Basic FastAPI validation | Comprehensive injection prevention | High |
| Rate limiting (per-user) | Global throttle only | Per-user rate limits | Medium |
| CloudFront access logs | Not enabled | Required for security monitoring | Medium |
| API Gateway access logs | Not enabled | Required for security monitoring | Medium |
| WAF blocking mode | Count mode only | Switch to block mode after baseline | Low |
| Data retention policy | No policy defined | Required for compliance | Medium |
| Opt-out mechanism | Not implemented | Required for GAI compliance | High |

---

## 5. Generative AI Compliance

### Model Usage
- **Models:** Claude Sonnet 4.6 (via `us.anthropic.claude-sonnet-4-6-v1`) and Claude Haiku 4.5 (via `us.anthropic.claude-haiku-4-5-20251001`)
- **Invocation:** Amazon Bedrock API (not direct Anthropic API)
- **Region:** us-west-2

### Data Handling
- **Input to model:** Course module titles, topic titles, and generation prompts (no PII, no student data)
- **Output from model:** Generated lab instructions and multiple-choice questions
- **Model training:** Amazon Bedrock does not use customer inputs/outputs to train foundation models by default
- **Data persistence:** Generated content is not stored server-side; returned directly to the user's browser

### GAI Golden Path Compliance
- [ ] Review AWS Generative AI Golden Path architectural guidance
- [ ] Implement user opt-out mechanism for data usage
- [ ] Document model selection rationale
- [ ] Implement content filtering/guardrails if required
- [ ] Add disclaimers to generated content (AI-generated, educator should review)

---

## 6. Threat Model (Summary)

### Assets
1. Canvas API token (SSM Parameter Store)
2. AWS Academy course structure metadata
3. Generated educational content
4. System availability

### Threat Actors
| Actor | Motivation | Capability |
|-------|-----------|-----------|
| External attacker | Access AWS resources, abuse Bedrock | High (internet-facing) |
| Unauthorized user | Free access to AI-generated content | Low-Medium |
| Malicious educator | Prompt injection, content abuse | Medium (authenticated) |

### Key Threats & Mitigations

| Threat | Impact | Current Mitigation | Planned Mitigation |
|--------|--------|-------------------|-------------------|
| Unauthenticated access | Unauthorized content generation, Bedrock cost abuse | Origin secret header, API throttling, WAF (count mode), Lambda URL removed, CORS restricted | Authentication (Cognito/SSO) |
| Prompt injection | Generate harmful/off-topic content | System prompts with guardrails, WAF KnownBadInputs rules | Input sanitization, Bedrock Guardrails |
| Canvas token compromise | Read access to course metadata | SSM encrypted storage (SecureString), Lambda-only access, no IAM users/keys | Token rotation, monitoring |
| DDoS / cost abuse | Service unavailability, unexpected AWS bill | API Gateway throttling (5 req/s), WAF Common rules, Bedrock IAM scoped to specific models | WAF block mode, per-user rate limits, budget alarms |
| Data exfiltration | Course content leakage | No data stored at rest, S3 versioning, all buckets encrypted (SSE-S3) | Access logs, monitoring |
| Direct API bypass | Attacker hits API Gateway/Lambda directly | Origin-verify header, Lambda Function URL deleted, single entry point via CloudFront | N/A (fully mitigated) |

---

## 7. Deployment & Operational Security

### Deployment Process
- Infrastructure deployed via CloudFormation (`template.yaml`)
- Backend code deployed via AWS CLI (`aws lambda update-function-code`)
- Frontend deployed via S3 sync (`aws s3 sync`)
- No CI/CD pipeline currently (manual deployment by owner)

### Operational Considerations
- Single owner/operator (Nureni Adeyemo)
- No on-call rotation
- No automated alerting beyond CloudWatch default metrics
- No disaster recovery plan documented

---

## 8. Questions for APSEC Review Team

1. What authentication mechanism is recommended for a restricted-audience tool like this? (Cognito with educator email verification? SAML/SSO with AWS Academy identity?)
2. ~~Is WAF required given the restricted user base and API throttling already in place?~~ **Resolved:** WAF deployed with AWS Managed Rules (Common + KnownBadInputs) in count mode; will switch to block mode after traffic baseline.
3. What level of audit logging satisfies the requirement for an educator-only tool that processes no student PII?
4. Are there specific Bedrock Guardrails configurations we should implement for educational content generation?
5. Does the tool require a separate privacy assessment given that no PII is processed or stored?

---

## Appendix A: File Structure

```
aws-academy-lab-assessment-generator/
├── backend/
│   ├── app.py                 # FastAPI application
│   ├── courses.py             # Canvas LMS integration
│   ├── generator.py           # Bedrock AI generation logic
│   ├── lambda_handler.py      # Lambda entry point
│   ├── markdown_formatter.py  # Content formatting
│   └── requirements.txt       # Python dependencies
├── frontend/                  # React SPA
├── infrastructure/
│   └── template.yaml          # CloudFormation template
├── docs/                      # Documentation
├── deploy.sh                  # Deployment script
└── run-local.sh              # Local development script
```

## Appendix B: API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/courses` | List available courses |
| GET | `/api/courses/{id}/modules` | Get modules for a course |
| POST | `/api/generate` | Generate lab/MCQ content |
| GET | `/api/health` | Health check |
