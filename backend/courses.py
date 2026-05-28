"""AWS Academy course configuration and Canvas integration."""

import os
import boto3
import requests

# Course → Certification mapping
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
}

CANVAS_API_URL = os.environ.get("CANVAS_API_URL", "https://awsacademy.instructure.com")

_canvas_token_cache = None


def _get_canvas_token():
    """Retrieve Canvas API token from SSM Parameter Store (or env var for local dev)."""
    global _canvas_token_cache
    if _canvas_token_cache is not None:
        return _canvas_token_cache

    token = os.environ.get("CANVAS_API_TOKEN", "")
    if token:
        _canvas_token_cache = token
        return token

    if os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        try:
            ssm = boto3.client("ssm", region_name=os.environ.get("AWS_REGION_NAME", "us-west-2"))
            resp = ssm.get_parameter(
                Name="/lab-assessment-generator/canvas-api-token",
                WithDecryption=True,
            )
            _canvas_token_cache = resp["Parameter"]["Value"]
            return _canvas_token_cache
        except Exception:
            return ""

    return ""


def get_courses():
    """Return list of available courses."""
    return [
        {"course_id": cid, **info}
        for cid, info in COURSES.items()
    ]


def get_modules(course_id):
    """Fetch modules from Canvas for a given course."""
    token = _get_canvas_token()
    if not token:
        return []

    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {token}"})

    url = f"{CANVAS_API_URL}/api/v1/courses/{course_id}/modules"
    params = {"per_page": 100}
    modules = []

    while url:
        resp = session.get(url, params=params)
        resp.raise_for_status()
        for mod in resp.json():
            name = mod.get("name", "")
            if not name.startswith("Module"):
                continue

            # Get module items (topics and labs)
            items_url = f"{CANVAS_API_URL}/api/v1/courses/{course_id}/modules/{mod['id']}/items"
            items_resp = session.get(items_url, params={"per_page": 100})
            items = items_resp.json() if items_resp.ok else []

            topics = []
            existing_labs = []
            for item in items:
                title = item.get("title", "")
                item_type = item.get("type", "")
                if item_type == "ExternalTool":
                    if title not in ("Student guide", "Student Guide", "Introduction",
                                     "Introduction Video", "Wrap Up Video", "Module wrap-up"):
                        topics.append(title)
                if item_type == "Assignment":
                    if "lab" in title.lower() or "activity" in title.lower():
                        existing_labs.append(title)

            modules.append({
                "module_id": mod["id"],
                "name": name,
                "topics": topics,
                "existing_labs": existing_labs,
            })

        url = resp.links.get("next", {}).get("url")
        params = None

    return modules
