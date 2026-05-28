"""FastAPI application for the Lab & Assessment Generator."""

import os
import json
import uuid
import boto3
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List

from generator import generate_assessment, CERTIFICATION_DOMAINS
from courses import get_courses, get_modules, COURSES
from markdown_formatter import format_as_markdown

CLOUDFRONT_ORIGIN_SECRET = os.environ.get("CLOUDFRONT_ORIGIN_SECRET", "")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "http://localhost:3000")


class OriginVerifyMiddleware(BaseHTTPMiddleware):
    """Block direct API access — only allow requests routed through CloudFront."""

    async def dispatch(self, request: Request, call_next):
        if not CLOUDFRONT_ORIGIN_SECRET:
            return await call_next(request)
        origin_header = request.headers.get("x-origin-verify", "")
        if origin_header != CLOUDFRONT_ORIGIN_SECRET:
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})
        return await call_next(request)


app = FastAPI(
    title="AWS Academy Lab & Assessment Generator",
    description="Generate scenario-based labs, quizzes, and rubrics for AWS Academy courses",
    version="2.0.0",
)

app.add_middleware(OriginVerifyMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

RESULTS_BUCKET = os.environ.get("RESULTS_BUCKET", "lab-assessment-generator-results-556411750482")
s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION_NAME", "us-west-2"))


class GenerateRequest(BaseModel):
    course_id: str = Field(..., description="Canvas course ID")
    module_name: str = Field(..., description="Module name from the course")
    module_topics: List[str] = Field(default=[], description="Topics covered in the module")
    existing_labs: List[str] = Field(default=[], description="Labs already in the module")
    learning_objective: str = Field(default="", max_length=1000, description="Optional custom objective")
    num_mcq: int = Field(default=0, ge=0, le=10)
    include_lab: bool = Field(default=True)
    include_rubric: bool = Field(default=True)


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "lab-assessment-generator"}


@app.get("/api/courses")
def list_courses():
    """List available AWS Academy courses."""
    return get_courses()


@app.get("/api/courses/{course_id}/modules")
def list_modules(course_id: str):
    """List modules for a course (fetched live from Canvas)."""
    if course_id not in COURSES:
        raise HTTPException(status_code=404, detail="Course not found")
    modules = get_modules(course_id)
    return modules


@app.post("/api/generate")
def generate(request: GenerateRequest):
    """Start async generation — invokes worker Lambda, returns job ID to poll."""
    if request.course_id not in COURSES:
        raise HTTPException(status_code=400, detail="Invalid course ID")

    course = COURSES[request.course_id]
    job_id = str(uuid.uuid4())

    s3.put_object(
        Bucket=RESULTS_BUCKET,
        Key=f"jobs/{job_id}.json",
        Body=json.dumps({"status": "processing"}),
        ContentType="application/json",
    )

    lambda_client = boto3.client("lambda", region_name=os.environ.get("AWS_REGION_NAME", "us-west-2"))
    lambda_client.invoke(
        FunctionName=os.environ.get("AWS_LAMBDA_FUNCTION_NAME", "lab-assessment-generator"),
        InvocationType="Event",
        Payload=json.dumps({
            "generate_job": {
                "job_id": job_id,
                "course_name": course["name"],
                "certification": course["certification"],
                "certification_name": course["certification_name"],
                "module_name": request.module_name,
                "module_topics": request.module_topics,
                "existing_labs": request.existing_labs,
                "learning_objective": request.learning_objective,
                "num_mcq": request.num_mcq,
                "include_lab": request.include_lab,
                "include_rubric": request.include_rubric,
            }
        }),
    )

    return {"job_id": job_id, "status": "processing"}


@app.get("/api/results/{job_id}")
def get_results(job_id: str):
    """Poll for generation results."""
    try:
        response = s3.get_object(Bucket=RESULTS_BUCKET, Key=f"jobs/{job_id}.json")
        data = json.loads(response["Body"].read())
        return JSONResponse(
            content=data,
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Job not found")
