#!/usr/bin/env node

const chalk = require('chalk');
const program = require('commander');
const fs = require('fs');
const path = require('path');

var oldPath;
var newPath;
var cutoffDelta;

function run() {
    program
        .arguments('<baseline> <current>')
        .option('-c, --cutoff <cutoff>', 'absolute cutoff delta to print report')
        .action(function(baseline, current, cutoff) {
            oldPath = path.resolve(process.cwd(), baseline);
            newPath = path.resolve(process.cwd(), current);
            cutoffDelta = program.cutoff || 0;

            _compare();

            process.exit(0);
        })
        .parse(process.argv);
    _validateInputs();
}

function _compare() {
    let oldJson = require(oldPath);
    let newJson = require(newPath);

    let noChange = [];
    let increased = [];
    let decreased = [];
    let onlyOld = [];
    let onlyNew = [];

    let assets = _compareAssets(oldJson, newJson);

    for (let assetName in assets) {
        let asset  = assets[assetName];
        if (asset.oldSize === asset.newSize) {
            noChange.push(asset);
        } else if (asset.oldSize < asset.newSize) {
            increased.push(asset);
        } else if (asset.oldSize > asset.newSize) {
            decreased.push(asset);
        } else if (asset.oldSize && !asset.newSize) {
            onlyOld.push(asset);
        } else if (!asset.oldSize && asset.newSize) {
            onlyNew.push(asset);
        }
    };

    _printReport(noChange, increased, decreased, onlyOld, onlyNew);
}

function _compareAssets(oldJson, newJson) {
    let assets = {};
    let modules = {};
    let oldChunks = _createChunksDictionary(oldJson.chunks);
    let newChunks = _createChunksDictionary(newJson.chunks);

    let assetNames = _createAssetNamesDictionary(oldJson, newJson);

    oldJson.assets.forEach((asset) => {
        let assetName = assetNames[asset.name] || asset.name;
        assets[assetName] = {
            name: assetName,
            oldSize: asset.size,
            modules: _getModulesForAsset(modules, oldChunks, asset, false /* isNew */)
        };
    });
    newJson.assets.forEach((asset) => {
        let assetName = assetNames[asset.name] || asset.name;
        if (assets[assetName]) {
            assets[assetName].newSize = asset.size;
            assets[assetName].modules = _getModulesForAsset(modules, newChunks, asset, true /* isNew */);
        } else {
            assets[assetName] = {
                name: assetName,
                newSize: asset.size,
                modules: _getModulesForAsset(modules, newChunks, asset, true /* isNew */)
            };
        }
    });

    return assets;
}

function _getModulesForAsset(modulesDict, chunks, asset, isNew) {
    let modules = [];
    asset.chunks.forEach((chunkId) => {
        let chunk = chunks[chunkId];
        chunk.modules.forEach((module) => {
            let moduleName = module.name.substr(module.name.lastIndexOf('/') + 1) + '_' + module.depth;
            if (!modulesDict[moduleName]) {
                modulesDict[moduleName] = {
                    name: moduleName,
                    identifier: module.identifier,
                    oldSize: 0,
                    newSize: 0
                }
            }
            if (isNew) {
                modulesDict[moduleName].newSize = module.size;
                modulesDict[moduleName].newId = module.id;
            } else {
                modulesDict[moduleName].oldSize = module.size;
                modulesDict[moduleName].oldId = module.id;
            }
            modules.push(modulesDict[moduleName]);
        });
    });
    return modules;
}

function _createChunksDictionary(chunks) {
    let dictChunks = {};
    chunks.forEach((chunk) => {
        dictChunks[chunk.id] = chunk;
    });
    return dictChunks;
}

function _createAssetNamesDictionary(oldJson, newJson) {
    let names = {};
    if (oldJson.assetsByChunkName) {
        for (let assetName in oldJson.assetsByChunkName) {
            names[oldJson.assetsByChunkName[assetName]] = assetName;
        }
    }
    if (newJson.assetsByChunkName) {
        for (let assetName in newJson.assetsByChunkName) {
            names[newJson.assetsByChunkName[assetName]] = assetName;
        }
    }
    return names;
}

function _printReport(noChange, increased, decreased, onlyOld, onlyNew) {
    const error = chalk.red;
    const warning = chalk.yellow;
    const success = chalk.green;

    console.log(chalk.red(`* ONLY IN NEW: ${onlyNew.length}`));
    onlyNew.sort((a, b) => { return b.newSize - a.newSize });
    onlyNew.forEach((asset) => {
        console.log(`    ${asset.name} : ${asset.newSize}`);
    });

    console.log(chalk.red(`* INCREASED: ${increased.length}`));
    increased.sort((a, b) => { return ((b.newSize - b.oldSize) - (a.newSize - a.oldSize)) });
    increased.forEach((asset) => {
        console.log(`    ${asset.name}: ${asset.newSize - asset.oldSize}`);
        console.log(`        ${_pad("Module")}\tCurrent\tBase\tDiff`);
        console.log(`        ======================================================`);
        let modules = asset.modules.sort((a, b) => { return ((b.newSize - b.oldSize) - (a.newSize - a.oldSize)) });
        let sum = 0;
        modules.forEach((module) => {
            let moduleDelta = module.newSize - module.oldSize;
            if (Math.abs(moduleDelta) >= cutoffDelta) {
                let moduleName = module.name.substr(0, module.name.lastIndexOf('_'));
                let paddedName = _pad(moduleName);
                if (moduleDelta > 0) {
                    console.log(error(`        ${paddedName}\t${module.newSize}\t${module.oldSize}\t${moduleDelta}`));
                }
                if (moduleDelta < 0) {
                    console.log(success(`        ${paddedName}\t${module.newSize}\t${module.oldSize}\t${moduleDelta}`));
                }

                if (moduleDelta !== 0) {
                    // parse identifier and print individual file names for composed modules
                    if (module.identifier.indexOf(' ') !== -1 && moduleName.endsWith(' modules')) {
                        let files = module.identifier.split(' ');
                        files.forEach((file) => {
                            let filePath = file.substr(file.lastIndexOf('!') + 1);
                            let fileName = filePath.substr(filePath.lastIndexOf('\\') + 1);
                            console.log(`         - ${fileName}`);
                        })
                    }
                }
            }
            sum += moduleDelta;
        });
        console.log(`        ======================================================`);
        // console.log(`        Total: ${sum}`); // TODO: why doesn't the sum add up????
    });

    console.log(chalk.yellow(`* UNCHANGED: ${noChange.length}`));
    if (cutoffDelta === 0) {
        noChange.forEach((asset) => {
            console.log(`    ${asset.name}`);
        });
    }

    console.log(chalk.green(`* DECREASED: ${decreased.length}`));
    decreased.sort((a, b) => { return ((b.newSize - b.oldSize) - (a.newSize - a.oldSize)) });
    decreased.forEach((asset) => {
        let delta = asset.newSize - asset.oldSize;
        if (Math.abs(delta) >= cutoffDelta) {
            console.log(`    ${asset.name} :  ${delta}`);
        }
    });

    console.log(chalk.green(`* ONLY IN OLD: ${onlyOld.length}`));
    onlyOld.sort((a, b) => { return b.oldSize - a.oldSize });
    onlyOld.forEach((asset) => {
        console.log(`    ${asset.name} : ${asset.oldSize}`);
    });
}

function _pad(str) {
    let pad = Array(30).join(' ');
    return (str + pad).substring(0, pad.length);
}

function _validateInputs() {
    _checkPathExists(oldPath);
    _checkPathExists(newPath);

}

function _checkPathExists(path) {
    if (!path) {
        console.log(chalk.red('Error: Missing required parameter: webpack-diff <baseline> <new>'));
        process.exit(1);
    }

    if (!fs.existsSync(path)) {
        console.error(chalk.red(`Error: ${path} does not exist.`));
        process.exit(1);
    }
}

run();