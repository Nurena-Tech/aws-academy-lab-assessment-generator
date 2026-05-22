"""AWS Lambda handler — handles both API requests and async worker invocations."""

import os
import json
import boto3
from mangum import Mangum
from app import app
from generator import generate_assessment
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
    """Process the generation job and store results in S3."""
    job_id = job["job_id"]

    try:
        result = generate_assessment(
            course_name=job["course_name"],
            certification=job["certification"],
            certification_name=job["certification_name"],
            module_name=job["module_name"],
            module_topics=job.get("module_topics", []),
            existing_labs=job.get("existing_labs", []),
            learning_objective=job.get("learning_objective", ""),
            num_mcq=job["num_mcq"],
            include_lab=job["include_lab"],
            include_rubric=job["include_rubric"],
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
