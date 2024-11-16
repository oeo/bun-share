#!/bin/bash

# Default region if not set
DEFAULT_REGION="us-east-1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Check if AWS CLI is installed
if ! which aws >/dev/null 2>&1; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Check if a bucket name was provided
if [ -z "$1" ]; then
    echo -e "${RED}Usage: $0 <bucket-name>${NC}"
    exit 1
fi

BUCKET_NAME="$1"
REGION="${AWS_DEFAULT_REGION:-$DEFAULT_REGION}"

# Create the bucket
echo "Creating bucket: $BUCKET_NAME in region: $REGION"
if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket \
        --bucket "$BUCKET_NAME" \
        --region "$REGION"
else
    aws s3api create-bucket \
        --bucket "$BUCKET_NAME" \
        --region "$REGION" \
        --create-bucket-configuration LocationConstraint="$REGION"
fi

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to create bucket${NC}"
    exit 1
fi

# Create bucket policy for public access
cat > /tmp/bucket-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": [
                "s3:GetObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::${BUCKET_NAME}",
                "arn:aws:s3:::${BUCKET_NAME}/*"
            ]
        }
    ]
}
EOF

# First disable block public access settings
echo "Configuring public access settings..."
aws s3api put-public-access-block \
    --bucket "$BUCKET_NAME" \
    --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to configure public access settings${NC}"
    exit 1
fi

# Wait a moment for settings to propagate
sleep 2

# Apply the bucket policy
echo "Setting bucket policy for public access..."
aws s3api put-bucket-policy \
    --bucket "$BUCKET_NAME" \
    --policy file:///tmp/bucket-policy.json

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to set bucket policy${NC}"
    exit 1
fi

# Enable static website hosting
echo "Enabling static website hosting..."
aws s3 website "s3://${BUCKET_NAME}" \
    --index-document index.html \
    --error-document error.html

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to enable static website hosting${NC}"
    exit 1
fi

# Add CORS configuration
cat > /tmp/cors-policy.json << EOF
{
    "CORSRules": [
        {
            "AllowedOrigins": ["*"],
            "AllowedMethods": ["GET", "HEAD"],
            "AllowedHeaders": ["*"],
            "MaxAgeSeconds": 3000
        }
    ]
}
EOF

echo "Setting CORS policy..."
aws s3api put-bucket-cors \
    --bucket "$BUCKET_NAME" \
    --cors-configuration file:///tmp/cors-policy.json

# Clean up
rm /tmp/bucket-policy.json
rm /tmp/cors-policy.json

echo -e "${GREEN}Bucket created successfully!${NC}"
echo -e "${GREEN}Bucket URL: http://${BUCKET_NAME}.s3.amazonaws.com/${NC}"
echo -e "${GREEN}Website URL: http://${BUCKET_NAME}.s3-website-${REGION}.amazonaws.com/${NC}"
echo
echo "You can now use this bucket with bun-share by setting:"
echo "export BUN_SHARE_BUCKET=${BUCKET_NAME}"

