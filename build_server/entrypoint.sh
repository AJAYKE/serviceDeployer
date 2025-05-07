#!/bin/bash
set -euo pipefail

# ENV variables (must be passed from ECS Task)
: "${GIT_REPOSITORY_URL:?Must provide GIT_REPOSITORY_URL}"
: "${SERVICE_PATH:?Must provide SERVICE_PATH (e.g., services/api)}"
: "${ECR_IMAGE_URI:?Must provide ECR_IMAGE_URI}"

# Clone the repo
echo "[INFO] Cloning repo $GIT_REPOSITORY_URL..."
git clone "$GIT_REPOSITORY_URL" /repo
cd "/repo/$SERVICE_PATH"

# Build using Nixpacks
echo "[INFO] Running nixpacks build..."
nixpacks build . --name temp-image

# Find the generated Dockerfile from Nixpacks (it's in .nixpacks)
DOCKERFILE=".nixpacks/Dockerfile"
if [ ! -f "$DOCKERFILE" ]; then
  echo "[ERROR] Dockerfile not found at $DOCKERFILE"
  exit 1
fi


# Run Kaniko to build and push the image
echo "[INFO] Building and pushing image to $ECR_IMAGE_URI using Kaniko..."
/kaniko/executor \
  --dockerfile="$DOCKERFILE" \
  --context=. \
  --destination="$ECR_IMAGE_URI" \
  --insecure \
  --skip-tls-verify

echo "[✅] Deployment image pushed to $ECR_IMAGE_URI"
