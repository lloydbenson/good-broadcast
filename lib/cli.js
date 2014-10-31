// Load modules

var Fs = require('fs');
var Os = require('os');

var log = require('./log');
var Hoek = require('hoek');
var Joi = require('joi');
var Package = require('../package.json');
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
        resumePath: Joi.string(),
        wait: Joi.number().default(1000).integer().min(1000),
        attempts: Joi.number().default(1).integer().min(1)
    });
    
    var result = Joi.validate(options, schema);

    return result;
};


var broadcast = exports.broadcast = function (log, options, callback) {

    options = Hoek.clone(options);

    if (!log.length) {
        return callback(null);
    }

    if (options.attempts < 1) {
        return callback(new Error('Maximum retires exceeded, giving up.'));
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

    Wreck.request(requestOptions.method, options.url, {
        payload: payload
    }, function (error, res) {

        if (error) {
            console.error(error);
            console.info('Retrying broadcast in %s milliseconds', options.wait);

            options.attempts -= 1;
            broadcast(log, options, callback);
        }
        else {
            res.on('end', callback);
            res.pipe(process.stdout);
        }
    });
};


internals.logLastIndex = function (index, path, done) {

    Fs.open(path, 'a', function (error, fileDescriptor) {

        if (error) {
            done(error);
        }
        else {
            // Synchronous file I/O to prevent this operation from getting interrupted
            var buffer = new Buffer(index+'');
            Fs.ftruncateSync(fileDescriptor, 0);
            Fs.writeSync(fileDescriptor, buffer, 0, buffer.length);
            Fs.closeSync(fileDescriptor);
            done(null);
        }
    });
};


exports.run = function (options) {

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

    var validation = internals.validateOptions(jsonResult);

    if (validation.error) {
        console.error('Invalid arguments: \n' + validation.error.annotate() + '\n\n');
        return process.exit(1);
    }

    config = validation.value;

    // Path implies resume
    config.resume = !!(config.resumePath && config.resumePath.length);

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

        var getStartFromLog = function () {

            getStats(config.log, function (error, result) {

                start = result.stats.size || 0;
                start = start ? start - 1 : 0;


                if (!config.newOnly) {
                    start = 0;
                }

                next(null, start, result);
            });
        };

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
                return callback(null, value);
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

                var wait = function (err) {

                    if (err) {
                        console.error(err);
                    }

                    setTimeout(function () {

                        callback(null, value);
                    }, config.interval);
                };

                value.start += bytesRead;

                var tasks = [];
                tasks.push(broadcast.bind(null, logResult, {
                    url: config.url,
                    attempts: config.attempts,
                    wait: config.wait
                }));

                if (config.resume) {
                    tasks.push(internals.logLastIndex.bind(null, value.start, config.resumePath));
                }

                Utils.series(tasks, wait);
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

            return process.exit(1);
        });
    });
};
