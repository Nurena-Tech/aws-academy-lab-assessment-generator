#!/bin/bash
# Deploy the Lab & Assessment Generator to AWS
set -e

STACK_NAME="lab-assessment-generator"
REGION="us-west-2"
PROFILE="nurena-bedrock-account"
FUNCTION_NAME="lab-assessment-generator"
ORIGIN_SECRET_PARAM="/lab-assessment-generator/cloudfront-origin-secret"

echo "=== AWS Academy Lab & Assessment Generator — Deployment ==="
echo ""

# Generate or retrieve the CloudFront origin secret
EXISTING_SECRET=$(aws ssm get-parameter --name "$ORIGIN_SECRET_PARAM" --region "$REGION" --profile "$PROFILE" --query 'Parameter.Value' --output text 2>/dev/null || echo "")
if [ -z "$EXISTING_SECRET" ]; then
    ORIGIN_SECRET=$(openssl rand -hex 32)
    echo "   Generated new CloudFront origin secret"
    aws ssm put-parameter \
        --name "$ORIGIN_SECRET_PARAM" \
        --value "$ORIGIN_SECRET" \
        --type SecureString \
        --region "$REGION" \
        --profile "$PROFILE" \
        --no-cli-pager > /dev/null
else
    ORIGIN_SECRET="$EXISTING_SECRET"
    echo "   Using existing CloudFront origin secret"
fi

# Sync Canvas API token to SSM from local .env
CANVAS_ENV_FILE="$HOME/aws-content-refresh-assistant/.env"
if [ -f "$CANVAS_ENV_FILE" ]; then
    CANVAS_TOKEN=$(grep "^CANVAS_API_TOKEN=" "$CANVAS_ENV_FILE" | cut -d'=' -f2-)
    if [ -n "$CANVAS_TOKEN" ]; then
        aws ssm put-parameter \
            --name "/lab-assessment-generator/canvas-api-token" \
            --value "$CANVAS_TOKEN" \
            --type SecureString \
            --overwrite \
            --region "$REGION" \
            --profile "$PROFILE" \
            --no-cli-pager > /dev/null
        echo "   Canvas API token synced to SSM"
    fi
fi

# Step 1: Deploy CloudFormation stack
echo "[1/5] Deploying CloudFormation stack..."
aws cloudformation deploy \
    --template-file infrastructure/template.yaml \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --capabilities CAPABILITY_NAMED_IAM \
    --profile "$PROFILE" \
    --parameter-overrides "CloudFrontOriginSecret=$ORIGIN_SECRET"

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

# Wait for code update to complete, then set ALLOWED_ORIGIN
echo "   Waiting for Lambda update to complete..."
aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --profile "$PROFILE" 2>/dev/null || sleep 5

echo "   Setting ALLOWED_ORIGIN on Lambda..."
aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --environment "Variables={AWS_REGION_NAME=$REGION,CLOUDFRONT_ORIGIN_SECRET=$ORIGIN_SECRET,ALLOWED_ORIGIN=$CF_URL}" \
    --region "$REGION" \
    --profile "$PROFILE" \
    --no-cli-pager > /dev/null

# Step 3: Build and deploy frontend (use CloudFront URL so API calls go through it)
echo ""
echo "[4/5] Building React frontend..."
cd frontend
REACT_APP_API_URL="$CF_URL" npm run build
cd ..

echo ""
echo "[5/5] Uploading frontend to S3..."
aws s3 sync frontend/build/ "s3://$BUCKET/" --delete --region "$REGION" --profile "$PROFILE" --no-cli-pager

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Web App URL: $CF_URL"
echo "API URL:     $API_URL (blocked for direct access — only via CloudFront)"
echo ""
echo "Note: CloudFront may take a few minutes to propagate. If you see errors, wait 2-3 minutes and refresh."
