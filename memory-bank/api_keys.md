# API Keys

This file contains API keys used in the project. This file should not be committed to the repository.

## Anthropic API Key

```
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
```

This API key is used for the Claude 3.7 model in the chess game tests. It's used as a fallback when the Cline agent API is not available.

## Usage

The API key is used in the following files:
- `chess_game.sh`
- `test-chess-api.sh`
- `test-cline-chess.sh`

To use the API key in a script, read it from this file or set it as an environment variable:

```bash
CLAUDE_API_KEY="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"
