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

// Declare internals
var internals = {
    lastIndex: 0,
    schemaName: 'good.v1',
    host: Os.hostname(),
    lastIndexPath: __dirname + '/lastBroadcast',
    appVer: Package.version,
    defaults: {
        useLastIndex: true,
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
            p: {
                alias: 'useLastIndex',
                description: 'Use previous index',
                boolean: true
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
            internals.argv = buildResult(options, argv);
            if (internals.argv.path) {
                internals.argv.path = internals.argv.path[0] !== '/' ? process.cwd() + '/' + internals.argv.path :internals.argv.path;
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

internals.logLastIndex = function (start) {

    var truncate = function (next) {

        Fs.exists(internals.lastIndexPath, function (exists) {

            if (!exists) {
                return next();
            }

            Fs.stat(internals.lastIndexPath, function (err, stat) {

                if (err) {
                    console.error(err);
                    return next();
                }

                Fs.truncate(internals.lastIndexPath, stat.size, next);
            });
        });
    };

    var lerg = function () {

        var lastIndexStream = Fs.createWriteStream(internals.lastIndexPath);

        lastIndexStream.on('error', function (err) {

            console.error(err);
            lastIndexStream.removeAllListeners();
        });

        lastIndexStream.write('\n' + start.toString(), function (err) {

            if (err) {
                console.error(err);
                return;
            }
        });
    };

    truncate(lerg);
};


exports.start = function () {

    var start = 0;
    var config = Hoek.applyToDefaults(internals.defaults, internals.argv);

    process.once('SIGUSR2', function () {

        process.exit(0);
    });

    var determineStart = function (next) {

        if (config.useLastIndex) {
            internals.lastIndexPath += ('_' + Path.basename(config.path));
        }

        if (config.useLastIndex && Fs.existsSync(internals.lastIndexPath)) {
            var lastContents = Fs.readFileSync(internals.lastIndexPath).toString().split('\n');
            start = parseInt(lastContents[lastContents.length - 1]);
            start = isNaN(start) ? 0 : start;
            Fs.truncateSync(internals.lastIndexPath);
            return next();
        }

        if (!config.onlySendNew) {
            return next();
        }

        Fs.exists(config.path, function (exists) {

            if (!exists) {
                return next();
            }

            Fs.stat(config.path, function (err, stat) {

                if (!err) {
                    start = stat.size ? stat.size - 1 : 0;
                }

                next();
            });
        });
    };

    var processLog = function () {
        Fs.exists(config.path, function (exists) {

            if (!exists) {
                return;
            }

            Fs.stat(config.path, function (err, stat) {

                if (err) {
                    console.error(err);
                    return;
                }

                if (stat.size < start) {
                    start = 0;
                }

                log.get(config.path, start, function (bytesRead, logResult) {

                    start += bytesRead;

                    internals.broadcast(logResult);


                    if (config.useLastIndex) {
                        internals.logLastIndex(start);
                    }
                });
            });
        });
    };

    determineStart(function () {

        setInterval(processLog, config.interval);
    });
};

