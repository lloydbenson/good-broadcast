// Load modules

var Fs = require('fs');
var Package = require('../package.json');
var Path = require('path');
var Os = require('os');
var log = require('./log');
var Yargs = require('yargs');
var Joi = require('joi');
var Wreck = require('wreck');
var Utils = require('./utils');

// Declare internals
var internals = {
    schemaName: 'good.v1',
    host: Os.hostname(),
    appVer: Package.version
};


internals.cliOptions = {
    c: {
        alias: 'config',
        description: 'Path to configuration file'
    },
    u: {
        alias: 'url',
        description: 'Url endpoint to send data'
    },
    l: {
        alias: 'path',
        description: 'Path to log file'
    },
    i: {
        alias: 'interval',
        description: 'Broadcast interval'
    },
    n: {
        alias: 'onlySendNew',
        description: 'Only send new records',
        boolean: true
    },
    p: {
        alias: 'useLastIndex',
        description: 'Use previous index',
        boolean: true
    },
    f: {
        alias: 'lastIndexPath',
        description: 'Location to store the last index file'
    }
};

var parser = Yargs.usage('good-broadcast [options]');
parser.options(internals.cliOptions);


internals.parseCommandLine = function (options) {

    var buildResult = function (source) {

        var parsedResult = {};
        var keys = Object.keys(internals.cliOptions);

        for (var i = 0, il = keys.length; i < il; ++i) {
            var key = keys[i];
            var alias = internals.cliOptions[key].alias;

            if (source[alias] != null) {
                parsedResult[alias] = source[alias];
            }
        }

        return parsedResult;
    };

    var result;
    var argv = parser.parse(options);

    if (argv.h) {
        Yargs.showHelp();
        return process.exit(0);
    }

    // Configuration file trumps command line
    if (argv.c) {
        try {
            var config = JSON.parse(Fs.readFileSync(argv.c, 'utf8'));
            result = buildResult(config);

        } catch (ex) {
            console.error('Invalid JSON config file: ' + argv.c);
            throw ex;
        }
    }
    else {
        result = buildResult(argv);
    }

    // -f implies -p
    result.useLastIndex = !!(result.lastIndexPath && result.lastIndexPath.length);

    return result;
};


internals.validateOptions = function (options) {

    var schema = Joi.object({
        url: Joi.string().required(),
        interval: Joi.number().default(1000).integer().min(1000),
        path: Joi.string().required(),
        onlySendNew: Joi.boolean().default(false),
        useLastIndex: Joi.boolean().default(false),
        lastIndexPath: Joi.string()
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

    var config;
    var timeoutId;
    var validation;
    var failAction;

    if (Array.isArray(options)) {
        var parsedObject = internals.parseCommandLine(options);
        validation = internals.validateOptions(parsedObject);

        failAction = function() {
            console.error('Invalid arguments: \n' + validation.error.annotate() + '\n\n');
            Yargs.showHelp();
            return process.exit(1);
        };
    }
    else {
        validation = internals.validateOptions(options);
        failAction = function () {
            throw new Error(validation.error.annotate());
        };
    }

    if (validation.error) {
        return failAction();
    }
    else if (!validation.value) {
        return;
    }


    config = validation.value;


    config.lastIndexPath = config.lastIndexPath || Path.join(Path.dirname(config.path), '.lastindex');

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

            Fs.readFile(config.lastIndexPath, {
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

            getStats(config.path, function (error, result) {

                start = result.stats.size || 0;
                start = start ? start - 1 : 0;


                if (!config.onlySendNew) {
                    start = 0;
                }

                next(null, start, result);
            });
        };

        if (config.useLastIndex) {
            readStartFromLastIndex();
        }
        else {
            getStartFromLog();
        }
    };

    var processLog = function (value, callback) {

        getStats(config.path, function (error, result) {

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

            log.get(config.path, value.start, function (bytesRead, logResult) {

                var wait = function () {

                    timeoutId = setTimeout(function () {

                        callback(null, value);
                    }, config.interval);
                };

                value.start += bytesRead;

                broadcast(logResult, config.url);

                    if (config.useLastIndex) {
                        return internals.logLastIndex(value.start, config.lastIndexPath, wait);
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
