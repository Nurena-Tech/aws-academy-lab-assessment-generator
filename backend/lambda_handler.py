"""AWS Lambda handler — handles both API requests and async worker invocations."""

import os
import json
import boto3
from concurrent.futures import ThreadPoolExecutor
from mangum import Mangum
from app import app
from generator import generate_assessment, generate_mcqs_only
from markdown_formatter import format_as_markdown

mangum_handler = Mangum(app, lifespan="off")

RESULTS_BUCKET = os.environ.get("RESULTS_BUCKET", "lab-assessment-generator-results-556411750482")
s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION_NAME", "us-west-2"))


def handler(event, context):
    """Route: async worker job or API Gateway request."""
    if "generate_job" in event:
        return handle_worker(event["generate_job"])
    return mangum_handler(event, context)


def handle_worker(job):
    """Process the generation job and store results in S3.

    Runs MCQ and Lab generation in parallel for faster results.
    """
    job_id = job["job_id"]
    num_mcq = job["num_mcq"]
    include_lab = job["include_lab"]
    include_rubric = job["include_rubric"]

    try:
        if num_mcq > 0 and include_lab:
            with ThreadPoolExecutor(max_workers=2) as executor:
                lab_future = executor.submit(
                    generate_assessment,
                    course_name=job["course_name"],
                    certification=job["certification"],
                    certification_name=job["certification_name"],
                    module_name=job["module_name"],
                    module_topics=job.get("module_topics", []),
                    existing_labs=job.get("existing_labs", []),
                    learning_objective=job.get("learning_objective", ""),
                    num_mcq=0,
                    include_lab=True,
                    include_rubric=include_rubric,
                )
                mcq_future = executor.submit(
                    generate_mcqs_only,
                    course_name=job["course_name"],
                    certification=job["certification"],
                    certification_name=job["certification_name"],
                    module_name=job["module_name"],
                    module_topics=job.get("module_topics", []),
                    learning_objective=job.get("learning_objective", ""),
                    num_mcq=num_mcq,
                )

                lab_result = lab_future.result()
                mcq_result = mcq_future.result()

            if "error" in lab_result:
                result = lab_result
            elif "error" in mcq_result:
                result = lab_result
                result["multiple_choice_questions"] = []
            else:
                result = lab_result
                result["multiple_choice_questions"] = mcq_result.get("multiple_choice_questions", [])

        elif num_mcq > 0 and not include_lab:
            mcq_result = generate_mcqs_only(
                course_name=job["course_name"],
                certification=job["certification"],
                certification_name=job["certification_name"],
                module_name=job["module_name"],
                module_topics=job.get("module_topics", []),
                learning_objective=job.get("learning_objective", ""),
                num_mcq=num_mcq,
            )
            if "error" in mcq_result:
                result = mcq_result
            else:
                result = {
                    "learning_objective": job.get("learning_objective", ""),
                    "certification": job["certification"],
                    "domain_alignment": {},
                    "lab_instructions": None,
                    "multiple_choice_questions": mcq_result.get("multiple_choice_questions", []),
                    "rubric": None,
                }
        else:
            result = generate_assessment(
                course_name=job["course_name"],
                certification=job["certification"],
                certification_name=job["certification_name"],
                module_name=job["module_name"],
                module_topics=job.get("module_topics", []),
                existing_labs=job.get("existing_labs", []),
                learning_objective=job.get("learning_objective", ""),
                num_mcq=0,
                include_lab=include_lab,
                include_rubric=include_rubric,
            )

        if "error" in result:
            output = {"status": "error", "error": result["error"]}
        else:
            markdown = format_as_markdown(result)
            output = {
                "status": "complete",
                "json_output": result,
                "markdown_output": markdown,
            }
    except Exception as e:
        output = {"status": "error", "error": str(e)}

    s3.put_object(
        Bucket=RESULTS_BUCKET,
        Key=f"jobs/{job_id}.json",
        Body=json.dumps(output, default=str),
        ContentType="application/json",
    )

    return {"statusCode": 200, "body": f"Job {job_id} complete"}
