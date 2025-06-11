package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"path"
	"strings"
	// For S3 error types
)

// Constants for S3 object path construction.
const (
	s3OutputsPrefix  = "__outputs"
	defaultIndexFile = "index.html"
)

// proxyHandler is the main HTTP handler for all incoming requests.
// It fetches content from S3 based on the request's host and path.
func proxyHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("Received request from %s for host: %s%s", r.RemoteAddr, r.Host, r.URL.Path)

	// 1. Extract the project ID from the hostname.
	projectID, err := getProjectIDFromHost(r.Host)
	if err != nil {
		log.Printf("Client Error: %v", err)
		http.Error(w, fmt.Sprintf("Bad Request: %v", err), http.StatusBadRequest)
		return
	}

	// 2. Construct the S3 object key.
	originalS3Key := buildS3Key(projectID, r.URL.Path)
	s3KeyToFetch := originalS3Key // Start with the original key

	log.Printf("Attempting to fetch S3 object: s3://%s/%s", s3BucketName, s3KeyToFetch)

	// 3. Attempt to get the object from S3.
	body, contentTypeFromS3, err := getS3Object(context.TODO(), s3KeyToFetch)
	if err != nil {
		// If the initial fetch results in a 404 (NoSuchKey), try with index.html if applicable.
		if strings.Contains(err.Error(), "NoSuchKey") || strings.Contains(err.Error(), "status code 404") {

			// Check if we already tried with index.html or if it's not a path that could have an index.html
			if !strings.HasSuffix(originalS3Key, "/"+defaultIndexFile) && !strings.HasSuffix(originalS3Key, defaultIndexFile) {
				s3KeyWithIndex := buildS3Key(projectID, r.URL.Path, true) // Re-build to ensure index.html is appended

				body, contentTypeFromS3, err = getS3Object(context.TODO(), s3KeyWithIndex)
				if err == nil {
					// Successfully found with index file, update the key for content type determination.
					s3KeyToFetch = s3KeyWithIndex
					goto ServeContent // Jump to the content serving section
				}
				// If trying with index.html also failed (or if it was a non-indexable path).
			}
			log.Printf("S3 Object Not Found after all attempts: %s", originalS3Key)
			http.Error(w, "Not Found", http.StatusNotFound)
			return
		}
		// For any other non-404 S3 error.
		log.Printf("Error fetching S3 object '%s': %v", s3KeyToFetch, err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

ServeContent: // Label for goto statement to jump here if index.html was found
	defer body.Close() // Ensure the S3 response body is closed.

	// 4. Set Content-Type header. Prefer S3's reported Content-Type, otherwise guess based on file extension.
	var contentType string
	if contentTypeFromS3 != nil && *contentTypeFromS3 != "" {
		contentType = *contentTypeFromS3
	} else {
		contentType = getContentType(s3KeyToFetch)
	}
	w.Header().Set("Content-Type", contentType)

	// 5. Copy the S3 object body to the HTTP response writer.
	bytesCopied, err := io.Copy(w, body)
	if err != nil {
		log.Printf("Error writing S3 object '%s' to response: %v", s3KeyToFetch, err)
		// It might be too late to send an HTTP error status if some bytes were already sent.
		// Log the error and let the connection close gracefully.
		return
	}
	log.Printf("Successfully served S3 object: %s (%d bytes)", s3KeyToFetch, bytesCopied)
}

// getProjectIDFromHost extracts the project ID from the incoming HTTP Host header.
// It assumes the format "project-id.yourdomain.com".
func getProjectIDFromHost(host string) (string, error) {
	// Remove port if present (e.g., "localhost:8080" or "project.domain.com:443")
	if strings.Contains(host, ":") {
		hostParts := strings.Split(host, ":")
		host = hostParts[0]
	}

	// Check if the host is a direct match for the base domain (e.g., yourdomain.com)
	if host == baseDomain {
		return "", fmt.Errorf("root domain '%s' hit, expected a subdomain '*.%s'", host, baseDomain)
	}

	// Check if the host ends with the base domain (e.g., "project1.yourdomain.com")
	if strings.HasSuffix(host, "."+baseDomain) {
		// Example: "project234.yourdomain.com" -> ["project234", "yourdomain", "com"]
		parts := strings.Split(host, ".")
		if len(parts) > 0 {
			projectID := parts[0]
			if projectID == "" {
				return "", fmt.Errorf("could not extract project ID from host: %s", host)
			}
			return projectID, nil
		}
	}

	// For custom domains (e.g., www.clientdomain.com), you'd need a mapping database.
	// For this simplified example, we return an error if it's not a subdomain of baseDomain.
	return "", fmt.Errorf("host '%s' does not match expected subdomain format '*.%s'", host, baseDomain)
}

// buildS3Key constructs the full S3 object key based on project ID and request path.
// It includes the fixed S3OutputsPrefix and handles default index files for directories.
func buildS3Key(projectID, requestPath string, useDefault ...bool) string {
	// Determine if useDefault is set and true, otherwise default to false.
	forceDefault := len(useDefault) > 0 && useDefault[0]

	// Normalize the request path: remove leading slash, handle empty path for root.
	cleanPath := strings.TrimPrefix(requestPath, "/")
	if cleanPath == "" || forceDefault {
		cleanPath = defaultIndexFile // Serve index.html for root requests or if forced.
	}

	// // If the path looks like a directory (e.g., "/about/"), append index.html unless forced.
	// if strings.HasSuffix(cleanPath, "/") && cleanPath != defaultIndexFile && !forceDefault {
	// 	cleanPath = path.Join(cleanPath, defaultIndexFile)
	// }

	// Construct the final S3 key: __outputs/project-id/path/to/file.html
	return path.Join(s3OutputsPrefix, projectID, cleanPath)
}

// getContentType determines the Content-Type header based on the file extension.
// This is a basic implementation; for production, consider a more robust MIME type library.
func getContentType(s3Key string) string {
	ext := strings.ToLower(path.Ext(s3Key))
	switch ext {
	case ".html", ".htm":
		return "text/html; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".js":
		return "application/javascript; charset=utf-8"
	case ".json":
		return "application/json; charset=utf-8"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".svg":
		return "image/svg+xml"
	case ".ico":
		return "image/x-icon"
	case ".pdf":
		return "application/pdf"
	// Add more as needed
	default:
		return "application/octet-stream" // Default for unknown types
	}
}
