"""AWS Lambda handler — wraps FastAPI with Mangum for API Gateway."""

from mangum import Mangum
from app import app

handler = Mangum(app, lifespan="off")
