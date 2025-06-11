package main

import (
	"context"
	"io"
	"log"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// getS3Object retrieves an object from the configured S3 bucket using the given key.
// It returns the object's body (io.ReadCloser), its Content-Type (as *string), and an error.
// It also handles specific S3 errors, especially NoSuchKey (404).
func getS3Object(ctx context.Context, key string) (io.ReadCloser, *string, error) {
	input := &s3.GetObjectInput{
		Bucket: aws.String(s3BucketName),
		Key:    aws.String(key),
	}

	resp, err := s3Client.GetObject(ctx, input)
	if err != nil {
		// Check for specific S3 404 error (NoSuchKey).
		// The AWS SDK v2 returns `types.NoSuchKey` or can be identified by the error string.
		if strings.Contains(err.Error(), "status code 404") || strings.Contains(err.Error(), "NoSuchKey") {
			// Return a specific error type to indicate Not Found.
			return nil, nil, &types.NoSuchKey{}
		}
		// For any other S3 error, log and return the original error.
		log.Printf("Error fetching S3 object '%s': %v", key, err)
		return nil, nil, err
	}

	// Return the response body and the ContentType from S3 (if present).
	return resp.Body, resp.ContentType, nil
}
