// Load modules

var Fs = require('fs');
var Package = require('../package.json');
var Path = require('path');
var Os = require('os');
var log = require('./log');
var Yargs = require('yargs');
var Async = require('async');
var Joi = require('joi');
var Wreck = require('wreck');

// Declare internals
var internals = {
    lastIndex: 0,
    schemaName: 'good.v1',
    host: Os.hostname(),
    appVer: Package.version
};

internals.setConfig = function () {

    var buildResult = function (options, source) {


        var parsedResult = {};
        var keys = Object.keys(options);
        var schema = Joi.object({
            url: Joi.string().required(),
            interval: Joi.number().default(1000).integer().min(1000),
            path: Joi.string().required(),
            onlySendNew: Joi.boolean().default(false),
            useLastIndex: Joi.boolean().default(true)
        });

        for (var i = 0, il = keys.length; i < il; ++i) {
            var key = keys[i];

            if (source[options[key].alias] != null) {
                parsedResult[options[key].alias] = source[options[key].alias];
            }
        }

        var validate = Joi.validate(parsedResult, schema);
        if (validate.error) {
            console.error('Invalid arguments: \n' + validate.error.annotate() + '\n\n');
            Yargs.showHelp();
            process.exit(1);
        }
        else {
            return validate.value;
        }
    };

    var options = {
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
        }
    };
    var parser = Yargs.usage('good-broadcast [options]');
    parser.options(options);
    var argv = parser.argv;

    if (argv.h) {
        Yargs.showHelp();
        process.exit(0);
    }

    // Configuration file trumps command line
    if (argv.c) {
        try {
            var config = JSON.parse(Fs.readFileSync(argv.c, 'utf8'));
            internals.argv = buildResult(options, config);

        } catch (ex) {
            console.error('Invalid JSON config file: ' + argv.c);
            throw ex;
        }
    }
    else {
        internals.argv = buildResult(options, argv);
    }
    internals.argv.path = Path.resolve(internals.argv.path);
    internals.lastIndexPath = Path.join(Path.dirname(internals.argv.path), '.lastIndex');
};


internals.setConfig();


internals.broadcast = function (log) {

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

    Wreck.request(requestOptions.method, internals.argv.url, {
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


internals.logLastIndex = function (index, done) {

    Fs.open(internals.lastIndexPath, 'a', function (error, fileDescriptor) {

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


exports.start = function () {

    var config = internals.argv;
    var timeoutId;

    var getStats = function (path, callback) {

        Fs.stat(path, function (error, stats) {

            var data = {
                stats: stats || {}
            };

            return callback(error, data);
        });
    };

    process.once('SIGUSR2', function () {

        clearTimeout(timeoutId);
        process.exit(0);
    });

    var determineStart = function (next) {
        var start;
        var readStartFromLastIndex = function() {
            Fs.readFile(internals.lastIndexPath, {
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

    var processLog = function (start, fileResult) {

        var startIndex = start;
        var previousResult = fileResult;

        return function (callback) {

            getStats(config.path, function(error, result) {
                if (error) {
                    console.error(error);
                    return callback(null);
                }

                var previousMtime = previousResult.stats.mtime;
                var resultMtime = result.stats.mtime;


                // If the file has been truncated since the last run.
                if (result.stats.size < startIndex) {
                    startIndex = 0;
                }
                else if (parseInt(result.stats.size, 10) === parseInt(previousResult.stats.size, 10)) {
                    // If the file has been overwritten and the length happens to be the same
                    if (resultMtime.getTime() > previousMtime.getTime()) {
                        startIndex = 0;
                    }
                }

                previousResult = result;

                log.get(config.path, startIndex, function (bytesRead, logResult) {

                    var wait = function () {

                        timeoutId = setTimeout(function () {

                            callback(null);
                        }, config.interval);
                    };

                    startIndex += bytesRead;

                    internals.broadcast(logResult);

                    if (config.useLastIndex) {
                        return internals.logLastIndex(startIndex, wait);
                    }

                    wait();

                });
            });
        };
    };

    determineStart(function (error, start, result) {

        Async.forever(processLog(start, result), function (error) {

            if (error) {
                console.error(error);
            }

            process.exit(1);
        });
    });
};
