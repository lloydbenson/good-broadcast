// Load modules

var Fs = require('fs');
var Hoek = require('hoek');
var Http = require('http');
var Package = require('../package.json');
var Path = require('path');
var Os = require('os');
var Url = require('url');
var log = require('./log');


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
    }
};


internals.broadcast = function (lerg) {

    if (!lerg.length) {
        return;
    }

    var envelope = {
        schema: internals.schemaName,
        host: internals.host,
        appVer: internals.appVer,
        timestamp: Date.now(),
        events: lerg
    };

    internals.request(JSON.stringify(envelope));
};


internals.request = function (payload) {

    var req = Http.request(internals.requestOptions, function (res) {

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


internals.getConfig = function (argv) {

    if (argv.c) {
        var configFile = Fs.readFileSync(argv.c);
        return JSON.parse(configFile.toString());
    }

    return {
        url: argv.u,
        path: argv.l[0] !== '/' ? process.cwd() + '/' + argv.l : argv.l,
        interval: argv.i ? parseInt(argv.i) : 10000,
        useLastIndex: argv.p !== undefined ? !!argv.p : true,
        onlySendNew: argv.n !== undefined ? !!argv.n : false,
    };
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


exports.start = function (argv) {

    process.once('SIGUSR2', function () {

        process.exit(0);
    });

    var start = 0;
    var config = internals.getConfig(argv);
    config = Hoek.applyToDefaults(internals.defaults, config);

    internals.requestOptions = Url.parse(config.url);
    internals.requestOptions.method = 'POST';
    internals.requestOptions.headers = { 'content-type': 'application/json' };
    internals.requestOptions.agent = false;

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

                log.get(config.path, start, function (bytesRead, lerg) {

                    start += bytesRead;
                    internals.broadcast(lerg);
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

