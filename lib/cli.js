'use strict';

const Fs = require('fs');
const Hoek = require('hoek');
const Joi = require('joi');
const Os = require('os');
const Wreck = require('wreck');

const Log = require('./log');
const Package = require('../package.json');
const Utils = require('./utils');

// Declare internals
const internals = {
    schemaName: 'good.v1',
    host: Os.hostname(),
    appVer: Package.version
};

internals.validateOptions = function (options) {

    const schema = Joi.object({
        url: Joi.string().required(),
        interval: Joi.number().default(1000).integer().min(1000),
        log: Joi.string().required(),
        newOnly: Joi.boolean().default(false),
        resumePath: Joi.string(),
        wait: Joi.number().default(1000).integer().min(1000),
        attempts: Joi.number().default(1).integer().min(1),
        maxEvents: Joi.number().integer().positive().default(32).description('Maximum events per payload'),
        maxSize: Joi.number().integer().positive().default(65535).description('Maximum payload size in bytes')
    });

    const result = Joi.validate(options, schema);
    return result;
};


const broadcast = exports.broadcast = function (log, options, callback) {

    options = Hoek.clone(options);

    if (!log.length) {
        return callback(null);
    }

    if (options.attempts < 1) {
        return callback(new Error('Maximum retires exceeded, giving up.'));
    }

    const envelope = {
        schema: internals.schemaName,
        host: internals.host,
        appVer: internals.appVer,
        timestamp: Date.now(),
        events: log
    };

    const requestOptions = {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        payload: JSON.stringify(envelope)
    };

    Wreck.request('POST', options.url, requestOptions, (error, res) => {

        if (error) {
            console.error(error);
            console.info('Retrying broadcast in %s milliseconds', options.wait);

            options.attempts -= 1;
            broadcast(log, options, callback);
        }
        else {
            res.on('end', callback);
            res.on('end', () => {

                process.stdout.write(Os.EOL);
            });

            res.pipe(process.stdout);
        }
    });
};


internals.logLastIndex = function (index, path, done) {

    Fs.open(path, 'a', (error, fileDescriptor) => {

        if (error) {
            done(error);
        }
        else {
            // Synchronous file I/O to prevent this operation from getting interrupted
            const buffer = new Buffer(index + '');
            Fs.ftruncateSync(fileDescriptor, 0);
            Fs.writeSync(fileDescriptor, buffer, 0, buffer.length);
            Fs.closeSync(fileDescriptor);
            done(null);
        }
    });
};


exports.run = function (options) {

    let configPath;
    let jsonResult;

    for (let i = 0; i < options.length; ++i) {
        const arg = options[i].toString().toLowerCase();

        if (arg === '-c' || arg === '--config') {
            configPath = options[i + 1];
        }
    }

    if (!configPath) {
        console.error('-c or --config option must be present and be a valid file path');
        return process.exit(1);
    }

    try {
        jsonResult = JSON.parse(Fs.readFileSync(configPath, 'utf8'));
    }
    catch (ex) {
        console.error('Invalid JSON config file: ' + configPath);
        return process.exit(1);
    }

    const validation = internals.validateOptions(jsonResult);

    if (validation.error) {
        console.error('Invalid arguments: \n' + validation.error.annotate() + '\n\n');
        return process.exit(1);
    }

    const config = validation.value;

    // Path implies resume
    config.resume = !!(config.resumePath && config.resumePath.length);

    const getStats = function (path, callback) {

        Fs.stat(path, (error, stats) => {

            const data = {
                stats: stats || {}
            };

            return callback(error, data);
        });
    };

    const determineStart = function (next) {

        let start;

        const getStartFromLog = function () {

            getStats(config.log, (error1, result) => {

                start = result.stats.size || 0;
                start = start ? start - 1 : 0;


                if (!config.newOnly) {
                    start = 0;
                }

                next(null, start, result);
            });
        };

        const readStartFromLastIndex = function () {

            Fs.readFile(config.resumePath, {
                encoding: 'utf8'
            }, (error, data) => {

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

    const processLog = function (value, callback) {

        getStats(config.log, (error, result) => {

            if (error) {
                console.error(error);
                return callback(null, value);
            }

            const previousMtime = value.previous.stats.mtime;
            const resultMtime = value.result.stats.mtime;


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

            Log.get(config.log, value.start, (bytesRead, logResult) => {

                const wait = function (err) {

                    if (err) {
                        console.error(err);
                    }

                    setTimeout(() => {

                        callback(null, value);
                    }, config.interval);
                };

                value.start += bytesRead;

                const tasks = [];
                const batch = Utils.batch(logResult, config);

                for (let i = 0; i < batch.length; ++i) {
                    tasks.push(broadcast.bind(null, batch[i], {
                        url: config.url,
                        attempts: config.attempts,
                        wait: config.wait
                    }));
                }

                if (config.resume) {
                    tasks.push(internals.logLastIndex.bind(null, value.start, config.resumePath));
                }

                Utils.series(tasks, wait);
            });
        });
    };

    determineStart((error1, start, result) => {

        Utils.recursiveAsync({
            start: start,
            result: result,
            previous: result
        }, processLog, (err) => {

            if (err) {
                console.error(err);
            }
            return process.exit(1);
        });
    });
};
