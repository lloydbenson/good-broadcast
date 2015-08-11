// Load modules

var Fs = require('fs');
var ChildProcess = require('child_process');
var Path = require('path');

// Declare internals
var internals = {
    tempFolder: Path.join(__dirname,'_temp')
};

// These should only run once
process.on('exit', function () {

    ChildProcess.exec('rm -rf ' + internals.tempFolder, function (err) {});
});

if (!Fs.existsSync(internals.tempFolder)) {
    Fs.mkdirSync(internals.tempFolder);
}
