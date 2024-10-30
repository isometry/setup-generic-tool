# `setup` action

The `isometry/setup-tool` action is designed to make the use of third-party tooling available via GitHub Releases as simple, streamlined and performant as possible within your workflows.

## Inputs

### `name` input

**Required** tool name

### `version` input

**Optional** version of tool to install (default: `"latest"`)

### `owner` input

**Required** owner of the tool repository

### `repo` input

**Optional** tool repository (defaults to `name`)

## Outputs

### `version` output

The version of tool actually installed.

## Example usage

```yaml
name: autobuild

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  autobuild:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - uses: isometry/setup-tool@main
        with:
          tool: apko
          version: v0.19.6 # default: latest
          owner: chainguard-dev

      - run: |
          apko publish example.yaml example:latest
```
