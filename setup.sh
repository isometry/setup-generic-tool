#!/usr/bin/env bash

set -euo pipefail

# Enable debug mode if RUNNER_DEBUG is 1
[[ "${RUNNER_DEBUG:-0}" == "1" ]] && set -x

# Function to print error and exit
error() {
    echo "ERROR: $1" >&2
    exit 1
}

# Function to print info
info() {
    echo "INFO: $1"
}

# Check for required commands
command -v curl >/dev/null 2>&1 || error "curl is required but not installed"
command -v jq >/dev/null 2>&1 || error "jq is required but not installed"

# Get inputs
REPO_NAME="$1"
VERSION="${2:-latest}"

# Validate inputs
[[ -z "${REPO_NAME}" ]] && error "Missing required input: repository name"

# Split repository name
IFS='/' read -r OWNER REPO <<< "${REPO_NAME}"
[[ -z "${OWNER}" || -z "${REPO}" ]] && error "Invalid repository name"

# Set tool name if not provided as third argument
TOOL_NAME="${3:-${REPO}}"

ASSET_NAME_INPUT="${4:-${TOOL_NAME}}"

# Validate tool name
[[ ! "${TOOL_NAME}" =~ ^[-A-Za-z0-9]+$ ]] && error "Invalid tool name"

# Determine platform and architecture
PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

if [[ ${PLATFORM} == "darwin" ]]; then
    PLATFORM_PATTERN="(darwin|macos)"
else
    PLATFORM_PATTERN="(${PLATFORM})"
fi

# Convert architecture to common formats
case "${ARCH}" in
    "aarch64"|"arm64")
        ARCH=arm64
        ARCH_PATTERN="(aarch64|arm64)"
        ;;
    "x86_64")
        ARCH=x64
        ARCH_PATTERN="(64bit|amd64|x64|x86_64)"
        ;;
    *)
        error "Unsupported architecture: ${ARCH}"
        ;;
esac

v3_api_call() {
    curl -sfL \
        -H "Accept: application/vnd.github+json" \
        -H "Authorization: Bearer ${GH_TOKEN}" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "https://api.github.com/$1"
}

download_release() {
    local url="${1:?download url required}"
    local out="${2:?asset name required}"
    info "Downloading ${url} to ${out}"
    curl -sSL -H "Authorization: token ${GH_TOKEN}" -o "${out}" "${url}"
}

# Get release information using GitHub CLI
if [[ "${VERSION}" = "latest" ]]; then
    RELEASE_DATA=$(v3_api_call "repos/${OWNER}/${REPO}/releases/latest")
    VERSION=$(jq -r '.tag_name' <<< "${RELEASE_DATA}")
    info "Resolved latest version: ${VERSION}"
else
    RELEASE_DATA=$(v3_api_call "repos/${OWNER}/${REPO}/releases/tags/${VERSION}")
fi

# Create cache directory
: "${RUNNER_TOOL_CACHE:=${HOME}/.cache/github-tools}"
mkdir -p "${RUNNER_TOOL_CACHE}"

TOOL_CACHE_DIR="${RUNNER_TOOL_CACHE}/${TOOL_NAME}/${VERSION#v}/${ARCH}"

if [[ -d "${TOOL_CACHE_DIR}" ]]; then
    info "Found ${TOOL_NAME} ${VERSION} in ${TOOL_CACHE_DIR}"
else
    info "Searching for ${TOOL_NAME} ${VERSION} for ${PLATFORM}/${ARCH}"
    ASSET_PATTERN="^${ASSET_NAME_INPUT}.+${PLATFORM_PATTERN}.+${ARCH_PATTERN}([.](tar[.]gz|zip))?\$"
    mapfile -t ASSETS < <(jq -r --arg pattern "${ASSET_PATTERN}" '.assets[] | select(.name | test($pattern; "i")) | .name' <<< "${RELEASE_DATA}")

    : "${ASSETS:?No matching release asset found}"

    info "Matching assets: ${ASSETS[*]}"

    # Take first matching asset (e.g. mikefarah/yq distributes both unarchived and .tar.gz assets)
    ASSET_NAME="${ASSETS[0]}"
    info "Found release asset: ${ASSET_NAME}"

    # Create temporary directory
    TMP_DIR=$(mktemp -d)
    info "Temporary directory: ${TMP_DIR}"
    cd "${TMP_DIR}"

    # Download and extract asset using gh cli
    info "Fetching ${ASSET_NAME} from ${OWNER}/${REPO}#${VERSION}"
    DOWNLOAD_URL=$(jq -r --arg asset "${ASSET_NAME}" '.assets[] | select(.name == $asset) | .browser_download_url' <<< "${RELEASE_DATA}")
    download_release "${DOWNLOAD_URL}" "${ASSET_NAME}"

    if [[ "${ASSET_NAME}" == *.zip ]]; then
        info "Extracting ${ASSET_NAME}"
        unzip -q "${ASSET_NAME}"
    elif [[ "${ASSET_NAME}" == *.tar.gz ]]; then
        info "Extracting ${ASSET_NAME}"
        tar tzf "${ASSET_NAME}"
        tar xzf "${ASSET_NAME}"
    fi

    # Find tool binary
    TOOL_PATH=$(find . -type f -name "${TOOL_NAME}*" -a \! -name "*.[0-9]" | grep -Ev '[.](tar[.]gz|zip)$' | head -n1)
    info "Detected tool binary: ${TOOL_PATH}"
    [[ -z "${TOOL_PATH}" ]] && error "Tool binary '${TOOL_NAME}' not found in extracted path"

    # Copy to cache directory
    mkdir -p "${TOOL_CACHE_DIR}"
    cp "${TOOL_PATH}" "${TOOL_CACHE_DIR}/${TOOL_NAME}"
    chmod +x "${TOOL_CACHE_DIR}/${TOOL_NAME}"

    info "Installed ${TOOL_NAME} version ${VERSION} in ${TOOL_CACHE_DIR}"

    # Cleanup
    cd - > /dev/null
    rm -rf "${TMP_DIR}"
fi

# Add to PATH
echo "${TOOL_CACHE_DIR}" >> "${GITHUB_PATH:-/dev/null}"
echo "version=${VERSION}" >> "${GITHUB_OUTPUT:-/dev/null}"
