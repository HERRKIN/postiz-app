#!/bin/bash

set -o xtrace

IMAGE_NAME="${POSTIZ_IMAGE:-postiz-s3:local}"

docker build -t "$IMAGE_NAME" -f Dockerfile.dev .
