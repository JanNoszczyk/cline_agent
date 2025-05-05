#!/bin/bash

LOG_DIR="run_logs"
OTHER_LOGS_DIR_NAME="other_logs" # Name of the subdirectory to exclude

# Clear the aggregated log file if it exists
echo "Aggregating logs into ${AGGREGATED_LOG_FILE}..."
> "${AGGREGATED_LOG_FILE}" # Create or truncate the file

# Check if LOG_DIR exists
if [ ! -d "${LOG_DIR}" ]; then
  echo "Log directory ${LOG_DIR} not found. No logs to aggregate."
  exit 0
fi

# Iterate over files in the log directory
for filepath in "${LOG_DIR}"/*; do
  filename=$(basename "${filepath}")

  # Skip if it's a directory
  if [ -d "${filepath}" ]; then
    # Specifically skip the OTHER_LOGS_DIR_NAME directory
    if [ "${filename}" == "${OTHER_LOGS_DIR_NAME}" ]; then
      echo "Skipping directory: ${filepath}"
    else
      echo "Skipping unexpected directory: ${filepath}"
    fi
    continue
  fi

  # Skip the aggregated log file itself
  if [ "${filename}" == "$(basename "${AGGREGATED_LOG_FILE}")" ]; then
    continue
  fi

  # Append header and content to the aggregated log file
  echo "Processing ${filename}..."
  echo "================================================================================" >> "${AGGREGATED_LOG_FILE}"
  echo "START OF LOGS FROM: ${filename}" >> "${AGGREGATED_LOG_FILE}"
  echo "================================================================================" >> "${AGGREGATED_LOG_FILE}"
  cat "${filepath}" >> "${AGGREGATED_LOG_FILE}"
  echo "" >> "${AGGREGATED_LOG_FILE}" # Add a newline for separation
  echo "================================================================================" >> "${AGGREGATED_LOG_FILE}"
  echo "END OF LOGS FROM: ${filename}" >> "${AGGREGATED_LOG_FILE}"
  echo "================================================================================" >> "${AGGREGATED_LOG_FILE}"
  echo "" >> "${AGGREGATED_LOG_FILE}" # Add a couple of newlines for better readability
  echo "" >> "${AGGREGATED_LOG_FILE}"
done

echo "Log aggregation complete. Output: ${AGGREGATED_LOG_FILE}"
# Make the script executable by default
chmod +x scripts/aggregate_run_logs.sh
