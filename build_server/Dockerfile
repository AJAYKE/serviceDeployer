FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    git \
    curl \
    unzip \
    npm \
    ca-certificates \
    awscli \
    bash \
    jq \
    && apt-get clean

# Install Nixpacks
RUN curl -sSL https://nixpacks.com/install.sh | bash

# Download and install Kaniko executor
RUN mkdir -p /kaniko && \
    curl -L -o /kaniko/executor https://github.com/GoogleContainerTools/kaniko/releases/download/v1.23.2/executor-linux-amd64 && \
    chmod +x /kaniko/executor

# Add entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
