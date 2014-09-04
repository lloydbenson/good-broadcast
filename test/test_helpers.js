//Load modules

var Hapi = require('hapi');
var Path = require('path');
var Crypto = require('crypto');
var Fs = require('fs');

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

exports.writeConfig = function (options) {

    var config = exports.uniqueFilename();
    Fs.writeFileSync(config, JSON.stringify(options));

    return config;
};

exports.inlineLogEntry = {
    lineOne:{
        event: 'request',
        id: '1369328752975-42369-3828',
        instance: 'http://localhost:8080',
        labels: ['api','hapi'],
        method: 'get',
        path: '/test',
        query: {},
        responseTime: 71,
        source: {
            remoteAddress: '127.0.0.1'
        },
        statusCode: 200,
        timestamp: 1369328752975,
        toString: function() {

            return JSON.stringify(this);
        }
    },
    lineTwo:{
        event: 'request',
        id: '1369328753222-42369-62002',
        instance: 'http://localhost:8080',
        labels: ['api', 'hapi'],
        method: 'get',
        path: '/test',
        query: {},
        responseTime: 9,
        source: {
            remoteAddress: '127.0.0.1'
        },
        statusCode: 200,
        timestamp: 1369328753222,
        toString: function() {

            return JSON.stringify(this);
        }
    },
    lineThree: {
        event: 'request',
        id: '1469328953222-42369-1',
        instance: 'http://localhost:8080',
        labels: ['api', 'http'],
        method: 'get',
        path: '/test2',
        query: {},
        responseTime: 19,
        source: {
            remoteAddress: '127.0.0.1'
        },
        statusCode: 200,
        timestamp: 1469328953222,
        toString: function() {

            return JSON.stringify(this);
        }
    }
};
