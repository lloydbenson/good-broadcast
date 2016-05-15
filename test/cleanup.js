'use strict';

const Fs = require('fs');
const ChildProcess = require('child_process');
const Path = require('path');

const internals = {
    tempFolder: Path.join(__dirname,'_temp')
};

// These should only run once
process.on('exit', () => {

    ChildProcess.exec('rm -rf ' + internals.tempFolder, (err1) => {});
});

if (!Fs.existsSync(internals.tempFolder)) {
    Fs.mkdirSync(internals.tempFolder);
}
