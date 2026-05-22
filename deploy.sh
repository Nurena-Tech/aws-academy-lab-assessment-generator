#!/bin/bash
# Deploy the Lab & Assessment Generator to AWS
set -e

STACK_NAME="lab-assessment-generator"
REGION="us-west-2"
PROFILE="nurena-bedrock-account"
FUNCTION_NAME="lab-assessment-generator"

echo "=== AWS Academy Lab & Assessment Generator — Deployment ==="
echo ""

# Step 1: Deploy CloudFormation stack
echo "[1/5] Deploying CloudFormation stack..."
aws cloudformation deploy \
    --template-file infrastructure/template.yaml \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --capabilities CAPABILITY_NAMED_IAM \
    --profile "$PROFILE"

echo "   Stack deployed: $STACK_NAME"

# Get stack outputs
BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --profile "$PROFILE" \
    --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' --output text --no-cli-pager)
CF_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --profile "$PROFILE" \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' --output text --no-cli-pager)
API_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --profile "$PROFILE" \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiURL`].OutputValue' --output text --no-cli-pager)

echo "   S3 Bucket: $BUCKET"
echo "   CloudFront: $CF_URL"
echo "   API Gateway: $API_URL"

# Step 2: Package and upload Lambda code
echo ""
echo "[2/5] Packaging Lambda code..."
rm -rf /tmp/lab-gen-package
mkdir -p /tmp/lab-gen-package

cp backend/app.py /tmp/lab-gen-package/
cp backend/generator.py /tmp/lab-gen-package/
cp backend/courses.py /tmp/lab-gen-package/
cp backend/markdown_formatter.py /tmp/lab-gen-package/
cp backend/lambda_handler.py /tmp/lab-gen-package/

pip install --target /tmp/lab-gen-package anthropic mangum fastapi pydantic boto3 requests -q

cd /tmp/lab-gen-package
zip -r /tmp/lab-gen-deploy.zip . -q
cd -

echo "   Package: $(du -h /tmp/lab-gen-deploy.zip | cut -f1)"

echo ""
echo "[3/5] Uploading Lambda code..."
aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb:///tmp/lab-gen-deploy.zip \
    --region "$REGION" \
    --profile "$PROFILE" \
    --no-cli-pager > /dev/null

echo "   Lambda code updated"

# Step 3: Build and deploy frontend
echo ""
echo "[4/5] Building React frontend..."
cd frontend
REACT_APP_API_URL="$API_URL" npm run build
cd ..

echo ""
echo "[5/5] Uploading frontend to S3..."
aws s3 sync frontend/build/ "s3://$BUCKET/" --delete --region "$REGION" --profile "$PROFILE" --no-cli-pager

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Web App URL: $CF_URL"
echo "API URL:     $API_URL"
echo ""
echo "Note: CloudFront may take a few minutes to propagate. If you see errors, wait 2-3 minutes and refresh."
