package main

import (
	"fmt"
	"os"
)

// Config holds all necessary application configuration.
type Config struct {
	S3BucketName string
	BaseDomain   string // e.g., "yourdomain.com"
	DefaultPort  string
	// Add other configurations like S3 region, timeouts if needed
}

const (
	// S3BucketNameEnvVar is the environment variable key for the S3 bucket name.
	S3BucketNameEnvVar = "S3_BUCKET_NAME"
	// BaseDomainEnvVar is the environment variable key for your base domain.
	BaseDomainEnvVar = "BASE_DOMAIN"
	// DefaultPort defines the fallback port if the PORT environment variable is not set.
	DefaultPort = "8080"
)

// LoadConfig reads configuration from environment variables and returns a Config struct.
// It returns an error if any mandatory environment variable is missing.
func LoadConfig() (*Config, error) {
	s3BucketName := os.Getenv(S3BucketNameEnvVar)
	if s3BucketName == "" {
		return nil, fmt.Errorf("error: %s environment variable not set. Please provide the S3 bucket name", S3BucketNameEnvVar)
	}

	baseDomain := os.Getenv(BaseDomainEnvVar)
	if baseDomain == "" {
		return nil, fmt.Errorf("error: %s environment variable not set. Please provide your base domain (e.g., example.com)", BaseDomainEnvVar)
	}

	return &Config{
		S3BucketName: s3BucketName,
		BaseDomain:   baseDomain,
		DefaultPort:  DefaultPort, // This can also be an env var if desired
	}, nil
}
