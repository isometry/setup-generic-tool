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
            tool: core.getInput('tool'),
            version: core.getInput('version') || 'latest',
        };

        if (!inputs.name) {
            throw new Error('Missing required input: name');
        }

        const [owner, repo] = inputs.name.split('/', 2);
        if (!owner || !repo) {
            throw new Error('Invalid repository name');
        }

        const tool = inputs.tool || repo;

        if (!/^[-A-Za-z0-9]+$/.test(tool)) {
            throw new Error('Invalid tool name');
        }

        let release;
        let version = inputs.version;

        if (version === 'latest') {
            release = await github.repos.getLatestRelease({
                owner: owner,
                repo: repo,
            });
            version = release.data.tag_name;
            core.info(`Resolved latest version: ${version}`);
        } else {
            release = await github.repos.getReleaseByTag({
                owner: owner,
                repo: repo,
                tag: version,
            });
        }

        let toolPath = tc.find(tool, version);

        if (!toolPath) {
            const platform = os.platform();
            let arch = os.arch();
            switch (arch) {
                case 'arm':
                    arch = '(arm|arm32)';
                    break;
                case 'arm64':
                    arch = '(aarch64|arm64)';
                    break;
                case 'ia32':
                    arch = '(x32|x86)';
                    break;
                case 'x64':
                    arch = '(amd64|x64|x86_64)';
                    break;
                default:
                    break;
            }

            const assetRegex = new RegExp(`^${tool}.+${platform}.+${arch}([.](zip|tar[.]gz))?$`, 'i');
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

            core.info(`Downloading ${tool} from ${toolUrl}`);
            const toolArchive = await tc.downloadTool(toolUrl);
            let extractPath = toolArchive;
            switch (archive) {
                case '':
                    break;
                case 'zip':
                    core.info(`Extracting zip archive: ${toolArchive}`);
                    extractPath = await tc.extractZip(toolArchive);
                    break;
                case 'tar.gz':
                    core.info(`Extracting tar.gz archive: ${toolArchive}`);
                    extractPath = await tc.extractTar(toolArchive, '', ['xz', '--strip-components=1']);
                    break;
                default:
                    throw new Error(`Unsupported archive format: ${archive}`);
            }

            toolPath = await tc.cacheFile(`${extractPath}/${tool}`, tool, tool, version);
        }

        core.addPath(toolPath);
        core.setOutput('version', version);
        core.info(`Installed ${tool} version ${version}`);
    } catch (err) {
        core.setFailed(`Action failed with error ${err} `);
    }
}
