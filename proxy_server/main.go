package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Global variables for configuration and S3 client, accessible across all files in the 'main' package.
var (
	s3Client     *s3.Client
	s3BucketName string
	baseDomain   string // e.g., "yourdomain.com"
)

// Configuration constants.
const (
	defaultPort        = "8080"
	s3BucketNameEnvVar = "S3_BUCKET_NAME"
	baseDomainEnvVar   = "BASE_DOMAIN"
)

func main() {
	log.SetOutput(os.Stdout)
	log.Println("Starting S3 Proxy Server...")

	// Load configuration from environment variables.
	// We'll manage errors directly here for simplicity, as per user's request.
	s3BucketName = os.Getenv(s3BucketNameEnvVar)
	if s3BucketName == "" {
		log.Fatalf("Error: %s environment variable not set. Please provide the S3 bucket name.", s3BucketNameEnvVar)
	}

	baseDomain = os.Getenv(baseDomainEnvVar)
	if baseDomain == "" {
		log.Fatalf("Error: %s environment variable not set. Please provide your base domain (e.g., example.com).", baseDomainEnvVar)
	}

	// Initialize the S3 client.
	initS3Client()

	// Set up the HTTP server. The `proxyHandler` is defined in `handler.go`.
	http.HandleFunc("/", proxyHandler)

	// Get the port from environment variable or use default.
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	log.Printf("Proxy server listening on :%s", port)
	log.Printf("Expecting subdomains under: *.%s", baseDomain)
	log.Printf("S3 bucket for content: %s", s3BucketName)

	// Start the HTTP server.
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}

// initS3Client initializes the global S3 client using default AWS configuration.
// This function is called from main.go but its logic is part of S3 interactions.
func initS3Client() {
	// Load AWS configuration. This will automatically look for credentials in:
	// 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION)
	// 2. Shared credential file (~/.aws/credentials)
	// 3. IAM role attached to the EC2 instance (if running on EC2)
	cfg, err := config.LoadDefaultConfig(context.TODO())
	if err != nil {
		log.Fatalf("Error loading AWS SDK config: %v", err)
	}

	s3Client = s3.NewFromConfig(cfg)
	log.Println("AWS S3 client initialized.")
}
