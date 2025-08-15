#!/bin/bash

REPO="sg-designdigitaldata/dynamodb-explorer-extension"
ASSET_EXT=".vsix"

# Get the latest release info from GitHub API
release_json=$(curl -s "https://api.github.com/repos/$REPO/releases/latest")

# Extract the asset download URL for the VSIX file
download_url=$(echo "$release_json" | grep "browser_download_url" | grep "$ASSET_EXT" | cut -d '"' -f 4)

if [ -z "$download_url" ]; then
  echo "No VSIX asset found in the latest release."
  exit 1
fi

# Download the VSIX file
echo "Downloading $download_url ..."
curl -L -o "$(basename "$download_url")" "$download_url"