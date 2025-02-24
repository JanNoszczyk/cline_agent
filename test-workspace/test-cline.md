# Testing the Cline Extension

This document provides instructions for testing the Cline extension in the Docker container.

## Basic Tests

1. **Open the Cline Extension**
   - Click on the Cline icon in the sidebar
   - Or use the keyboard shortcut (usually `Ctrl+Shift+P` and type "Cline")

2. **Test Basic Functionality**
   - Enter a simple task like "What is the current time?"
   - The extension should respond with the current time

3. **Test File Reading**
   - Ask Cline to read the contents of a file, e.g., "What's in the sample.txt file?"
   - Cline should be able to read and display the contents of the file

4. **Test Code Completion**
   - Open the `app.js` file
   - Ask Cline to implement the TODO item: "Implement the function to calculate the average of an array of numbers"
   - Cline should generate the implementation for the function

## Testing the API Server

The Cline extension includes an API server that runs on port 3000. To test the API server:

1. **Run the Test Script**
   ```bash
   ./test-api.sh
   ```

2. **Manual API Testing**
   ```bash
   # Get the current state
   curl http://localhost:3000/api/state -H "X-API-Key: your-api-key"
   
   # Get the task history
   curl http://localhost:3000/api/tasks -H "X-API-Key: your-api-key"
   ```

## Testing Browser Integration

1. **Open the HTML File**
   - Open the `index.html` file in the editor
   - Ask Cline to "Show me this HTML file in a browser"
   - Cline should be able to launch a browser and display the HTML file

2. **Test Browser Interaction**
   - Ask Cline to "Click the test button on the page"
   - Cline should be able to interact with the browser and click the button

## Troubleshooting

If you encounter issues with the Cline extension, try the following:

1. **Check the Extension Status**
   - Open the Extensions panel (Ctrl+Shift+X)
   - Verify that the Cline extension is installed and enabled

2. **Check the API Server**
   - Run the test script to verify that the API server is running
   - Check the container logs for any errors

3. **Restart the Container**
   - If all else fails, try restarting the container:
     ```bash
     docker-compose restart cline-server
