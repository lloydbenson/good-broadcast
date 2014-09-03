// Load modules

var Fs = require('fs');
var Package = require('../package.json');
var Os = require('os');
var log = require('./log');
var Joi = require('joi');
var Wreck = require('wreck');
var Utils = require('./utils');

// Declare internals
var internals = {
    schemaName: 'good.v1',
    host: Os.hostname(),
    appVer: Package.version
};

internals.validateOptions = function (options) {

    var schema = Joi.object({
        url: Joi.string().required(),
        interval: Joi.number().default(1000).integer().min(1000),
        log: Joi.string().required(),
        newOnly: Joi.boolean().default(false),
        resumePath: Joi.string()
    });
    
    var result = Joi.validate(options, schema);

    return result;
};


var broadcast = exports.broadcast = function (log, url) {

    if (!log.length) {
        return;
    }

    var envelope = {
        schema: internals.schemaName,
        host: internals.host,
        appVer: internals.appVer,
        timestamp: Date.now(),
        events: log
    };

    var requestOptions = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        agent: false
    };
    var payload = JSON.stringify(envelope);

    Wreck.request(requestOptions.method, url, {
        payload: payload
    }, function (error, res) {

        if (error) {
            console.error(error);
        }
        else {
            res.pipe(process.stdout);
        }
    });
};


internals.logLastIndex = function (index, path, done) {

    Fs.open(path, 'a', function (error, fileDescriptor) {

        if (error) {
            console.error(error);
        }
        else {
            // Synchronous file I/O to prevent this operation from getting interrupted
            var buffer = new Buffer(index+'');
            Fs.ftruncateSync(fileDescriptor, 0);
            Fs.writeSync(fileDescriptor, buffer, 0, buffer.length);
            Fs.closeSync(fileDescriptor);
        }

        done();
    });
};


exports.run = function (options) {

    var timeoutId;
    var validation;
    var configPath;
    var config;
    var jsonResult;


    for (var i = 0, il = options.length; i < il; ++i) {
        var arg = options[i].toString().toLowerCase();

        if (arg === '-c' || arg === '--config') {
            configPath = options[i+1];
        }
    }

    if (!configPath) {
        console.error('-c or --config option must be present and be a valid file path');
        return process.exit(1);
    }

    try {
        jsonResult = JSON.parse(Fs.readFileSync(configPath, 'utf8'));
    } catch (ex) {
        console.error('Invalid JSON config file: ' + configPath);
        return process.exit(1);
    }

    validation = internals.validateOptions(jsonResult);

    if (validation.error) {
        console.error('Invalid arguments: \n' + validation.error.annotate() + '\n\n');
        return process.exit(1);
    }

    config = validation.value;

    // Path implies resume
    config.resume = !!(config.resumePath && config.resumePath.length);


    process.once('SIGUSR2', function () {

        clearTimeout(timeoutId);
        return process.exit(0);
    });

    var getStats = function (path, callback) {

        Fs.stat(path, function (error, stats) {

            var data = {
                stats: stats || {}
            };

            return callback(error, data);
        });
    };

    var determineStart = function (next) {

        var start;
        var readStartFromLastIndex = function() {

            Fs.readFile(config.resumePath, {
                encoding: 'utf8'
            }, function (error, data) {

                if (error) {
                    getStartFromLog();
                }
                else {
                    start = parseInt(data, 10);
                    next(null, start, {
                        stats: {}
                    });
                }
            });
        };

        var getStartFromLog = function() {

            getStats(config.log, function (error, result) {

                start = result.stats.size || 0;
                start = start ? start - 1 : 0;


                if (!config.newOnly) {
                    start = 0;
                }

                next(null, start, result);
            });
        };

        if (config.resume) {
            readStartFromLastIndex();
        }
        else {
            getStartFromLog();
        }
    };

    var processLog = function (value, callback) {

        getStats(config.log, function (error, result) {

            if (error) {
                console.error(error);
                return callback(null);
            }

            var previousMtime = value.previous.stats.mtime;
            var resultMtime = value.result.stats.mtime;


            // If the file has been truncated since the last run.
            if (result.stats.size < value.start) {
                value.start = 0;
            }
            else if (parseInt(value.result.stats.size, 10) === parseInt(value.previous.stats.size, 10)) {
                // If the file has been overwritten and the length happens to be the same
                if (resultMtime.getTime() > previousMtime.getTime()) {
                    value.start = 0;
                }
            }

            value.previous = result;

            log.get(config.log, value.start, function (bytesRead, logResult) {

                var wait = function () {

                    timeoutId = setTimeout(function () {

                        callback(null, value);
                    }, config.interval);
                };

                value.start += bytesRead;

                broadcast(logResult, config.url);

                    if (config.resume) {
                        return internals.logLastIndex(value.start, config.resumePath, wait);
                    }

                    wait();
                });
            });
        };

    determineStart(function (error, start, result) {

        Utils.recursiveAsync({
            start: start,
            result: result,
            previous: result
        }, processLog, function (error) {

            if (error) {
                console.error(error);
            }

            clearTimeout(timeoutId);
            return process.exit(1);
        });
    });
};
