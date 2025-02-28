# API Keys

This file contains information about API keys used in the project. This file should not be committed to the repository.

## API Keys for Testing

For testing purposes, you can use placeholder API keys. In production, replace these with actual API keys.

## Usage

API keys are used in the following files:
- Docker configuration files
- API server scripts
- Testing scripts

To use an API key in a script, read it from this file or set it as an environment variable:

```bash
CLINE_API_KEY="your-api-key-here"
```

## Security Considerations

- Never commit actual API keys to the repository
- Use environment variables or secure storage for API keys
- Rotate API keys regularly
- Use different API keys for development and production
