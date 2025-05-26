module github.com/your-org/cline-grpc-adapter

go 1.19

require (
	github.com/your-org/grpc-testing-framework v0.1.0
	google.golang.org/grpc v1.56.0
	google.golang.org/protobuf v1.30.0
)

replace github.com/your-org/grpc-testing-framework => ../grpc-testing-framework

require (
	github.com/golang/protobuf v1.5.3 // indirect
	golang.org/x/net v0.9.0 // indirect
	golang.org/x/sys v0.7.0 // indirect
	golang.org/x/text v0.9.0 // indirect
	google.golang.org/genproto v0.0.0-20230410155749-daa745c078e1 // indirect
)