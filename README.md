# `setup-generic-tool` action

The `isometry/setup-generic-tool` action is designed to make the use of generic third-party tooling available via GitHub Releases as simple, streamlined and performant as possible within your workflows.

## Features

* Fully exploits GitHub Runners' Tool Cache mechanism
* Automatic version resolution

## Inputs

### `name` input

**Required** GitHub repository of the desired tool (example: `owner/repo`)

### `tool` input

**Optional** Override tool name, if it doesn't match the repo name

### `version` input

**Optional** Version of tool to install (default: `latest`; example: `v1.2.3`)

## Outputs

### `version` output

The version of tool actually installed.

## Example usage

```yaml
name: example

on:
  push:
    branches: [main]

jobs:
  example:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - uses: isometry/setup-generic-tool@v1
        with:
          name: chainguard-dev/apko

      - run: |
          apko version
```
