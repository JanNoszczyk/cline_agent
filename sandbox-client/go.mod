module sandboxclient

go 1.22 // Match the Go version used in the Dockerfile (using 1.22 minor version)

require (
	google.golang.org/grpc v1.64.0
	google.golang.org/protobuf v1.34.1
)

// Add indirect dependencies (these might be auto-populated by 'go mod tidy' later)
require (
	golang.org/x/net v0.24.0 // indirect
	golang.org/x/sys v0.19.0 // indirect
	golang.org/x/text v0.14.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20240401170217-c3f982113cda // indirect
)

// Removed replace directive
