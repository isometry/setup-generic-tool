'use strict'

import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as os from 'os';
import { Octokit } from '@octokit/rest';

const github = new Octokit();

if (require.main === module) {
    main().catch(err => {
        console.error(err.stack);
        process.exit(1);
    });
}

async function main(): Promise<void> {
    try {
        const inputs = {
            name: core.getInput('name'),
            version: core.getInput('version'),
            owner: core.getInput('owner'),
            repo: core.getInput('repo'),
        };

        if (!inputs.name) {
            throw new Error('Missing required input: name');
        }

        if (!inputs.version) {
            core.info('version not provided, using latest');
            inputs.version = 'latest';
        }

        if (!inputs.owner) {
            throw new Error('Missing required input: owner');
        }

        if (!inputs.repo) {
            core.info('repo not provided, using name as repo');
            inputs.repo = inputs.name;
        }

        const version = (inputs.version === 'latest')
            ? await github.repos.getLatestRelease({
                owner: inputs.owner,
                repo: inputs.repo,
            }).then(res => res.data.tag_name)
            : inputs.version;

        let toolPath = tc.find(inputs.name, version);

        if (!toolPath) {
            const platform = os.platform();
            let arch = os.arch();
            if (arch === 'x64') {
                arch = 'amd64';
            }

            const toolUrl = `https://github.com/${inputs.owner}/${inputs.repo}/releases/download/${version}/${inputs.name}_${version.slice(1)}_${platform}_${arch}.zip`;
            core.info(`Downloading ${inputs.name} from ${toolUrl}`);
            const toolZip = await tc.downloadTool(toolUrl);
            const extractPath = await tc.extractZip(toolZip);
            toolPath = await tc.cacheFile(`${extractPath}/${inputs.name}`, inputs.name, inputs.name, version);
        }

        core.addPath(toolPath);
        core.setOutput('version', version);
        core.info(`Installed ${inputs.name} version ${version}`);
    } catch (err) {
        core.setFailed(`Action failed with error ${err}`);
    }
}
