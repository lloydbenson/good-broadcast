// Load modules

var Fs = require('fs');
var Hoek = require('hoek');
var Http = require('http');
var Package = require('../package.json');
var Path = require('path');
var Os = require('os');
var Url = require('url');
var log = require('./log');
var Yargs = require('yargs');
var Async = require('async');

// Declare internals
var internals = {
    lastIndex: 0,
    schemaName: 'good.v1',
    host: Os.hostname(),
    appVer: Package.version,
    defaults: {
        interval: 10000,
        onlySendNew: false
    },
    parseConfig: function () {

        var buildResult = function (options, source) {

            var result = {};
            var keys = Object.keys(options);

            for (var i = 0, il = keys.length; i < il; ++i) {
                var key = keys[i];
                result[options[key].alias] = source[options[key].alias];
            }
            return result;
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
                description: 'Broadcast interval',
                default: 10000
            },
            n: {
                alias: 'onlySendNew',
                description: 'Only send new records',
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
        } else {
            if (!argv.u) {
                Yargs.showHelp();
                process.exit(0);
            } 
            internals.argv = buildResult(options, argv);
            if (internals.argv.path) {
                internals.argv.path = Path.resolve(internals.argv.path);
            }
        }
    }
};

internals.parseConfig();


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

    var requestDefaults = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        agent: false
    };

    var payload = JSON.stringify(envelope);
    var requestOptions = Url.parse(internals.argv.url);

    Hoek.merge(requestOptions, requestDefaults);

    var req = Http.request(requestOptions, function (res) {

        res.on('error', function (err) {

            console.error(err);
        });

        res.pipe(process.stdout);                               // Pipe any response details to stdout
    });
    req.on('error', function (err) {

        console.error(err);
    });

    req.write(payload);
    req.end();
};

exports.start = function () {

    var config = Hoek.applyToDefaults(internals.defaults, internals.argv);

    var getStats = function (path, callback) {

        Fs.stat(path, function (error, stats) {

            var data = {
                stats: stats || {}
            };

            return callback(error, data);
        });
    };

    process.once('SIGUSR2', function () {

        process.exit(0);
    });

    var determineStart = function (next) {
        var start;

      getStats(config.path, function (error, result) {

          start = result.stats.size || 0;
          start = start ? start - 1 : 0;

          if (!config.onlySendNew) {
              start = 0;
          }

          next(start, result);
      });
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

                // If the file has been truncated since the last run.
                if (result.stats.size < startIndex) {
                    previousResult = result;
                    startIndex = 0;
                } else if (parseInt(result.stats.size, 10) === parseInt(previousResult.stats.size, 10)) {
                    // If the file has been overwritten and the length happens to be the same
                    if (result.stats.mtime.getTime() !== previousResult.stats.mtime.getTime()) {
                        previousResult = result;
                        startIndex = 0;
                    }
                }

                log.get(config.path, startIndex, function (bytesRead, logResult) {

                    startIndex += bytesRead;

                    internals.broadcast(logResult);

                    setTimeout(function () {

                        callback(null);
                    }, config.interval);
                });
            });
        };
    };

    determineStart(function(start, result) {

        Async.forever(processLog(start, result), function () {

            process.exit(1);
        });
    });
};
