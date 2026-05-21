"""FastAPI application for the Lab & Assessment Generator."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

from generator import generate_assessment, CERTIFICATION_DOMAINS
from markdown_formatter import format_as_markdown

app = FastAPI(
    title="AWS Academy Lab & Assessment Generator",
    description="Generate scenario-based labs, quizzes, and rubrics from learning objectives",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    learning_objective: str = Field(..., min_length=10, max_length=1000)
    certification: str = Field(default="CLF-C02")
    num_mcq: int = Field(default=5, ge=1, le=10)
    include_lab: bool = Field(default=True)
    include_rubric: bool = Field(default=True)


class GenerateResponse(BaseModel):
    json_output: dict
    markdown_output: str


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "lab-assessment-generator"}


@app.get("/api/certifications")
def list_certifications():
    return CERTIFICATION_DOMAINS


@app.post("/api/generate", response_model=GenerateResponse)
def generate(request: GenerateRequest):
    if request.certification not in CERTIFICATION_DOMAINS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid certification. Choose from: {list(CERTIFICATION_DOMAINS.keys())}"
        )

    result = generate_assessment(
        learning_objective=request.learning_objective,
        certification=request.certification,
        num_mcq=request.num_mcq,
        include_lab=request.include_lab,
        include_rubric=request.include_rubric,
    )

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    markdown = format_as_markdown(result)
    return GenerateResponse(json_output=result, markdown_output=markdown)
