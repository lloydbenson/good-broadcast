//Load modules

var Hapi = require('hapi');
var Path = require('path');
var Crypto = require('crypto');

//Declare internals

var internals = {
    tempFolder: Path.join(__dirname,'_temp')
};

exports.createTestServer = function (options, handler) {

    if (arguments.length === 1) {
        handler = options;
        options = {};
    }

    options = options || {};

    options.host = options.host || '127.0.0.1';
    options.port = options.port || 0;

    var server = Hapi.createServer(options.host, options.port);

    server.route({
        path: '/',
        method: 'POST',
        handler: handler
    });

    return server;
};

exports.uniqueFilename = function () {

    var name = [Date.now(), process.pid, Crypto.randomBytes(8).toString('hex')].join('-') + '.__test';
    return Path.join(internals.tempFolder, name);
};