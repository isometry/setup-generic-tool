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

        let release;
        let version = inputs.version;

        if (version === 'latest') {
            release = await github.repos.getLatestRelease({
                owner: inputs.owner,
                repo: inputs.repo,
            });
            version = release.data.tag_name;
            core.info(`Resolved latest version: ${version}`);
        } else {
            release = await github.repos.getReleaseByTag({
                owner: inputs.owner,
                repo: inputs.repo,
                tag: inputs.version,
            });
        }

        let toolPath = tc.find(inputs.name, version);

        if (!toolPath) {
            const platform = os.platform();
            let arch = os.arch();
            if (arch === 'x64') {
                arch = 'amd64';
            }

            const assetRegex = new RegExp(`^${inputs.name}.+${platform}.+${arch}([.](zip|tar[.]gz))?$`, 'i');
            let matchingAssets = release.data.assets.filter(
                asset => assetRegex.test(asset.name)
            );

            if (matchingAssets.length !== 1) {
                core.info(`All release assets: [${release.data.assets.map(asset => asset.name).join(', ')}]`);
                throw new Error(`Expected exactly one matching asset, but found ${matchingAssets.length}`);
            }

            const asset = matchingAssets[0];
            let archive = '';
            const archiveMatch = asset.name.match(/\.(zip|tar\.gz)$/);
            if (archiveMatch) {
                archive = archiveMatch[1];
            }

            core.info(`Found release asset: '${asset.browser_download_url}'`);
            const toolUrl = asset.browser_download_url;

            core.info(`Downloading ${inputs.name} from ${toolUrl}`);
            const toolArchive = await tc.downloadTool(toolUrl);
            let extractPath = toolArchive;
            if (archive === 'zip') {
                core.info(`Extracting zip archive: ${toolArchive}`);
                extractPath = await tc.extractZip(toolArchive);
            } else if (archive === 'tar.gz') {
                core.info(`Extracting tar.gz archive: ${toolArchive}`);
                extractPath = await tc.extractTar(toolArchive, '', ['xz', '--strip-components=1']);
            } else if (archive !== '') {
                throw new Error(`Unsupported archive format: ${archive}`);
            }

            toolPath = await tc.cacheFile(`${extractPath} / ${inputs.name}`, inputs.name, inputs.name, version);
        }

        core.addPath(toolPath);
        core.setOutput('version', version);
        core.info(`Installed ${inputs.name} version ${version}`);
    } catch (err) {
        core.setFailed(`Action failed with error ${err} `);
    }
}
