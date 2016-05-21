'use strict';

const Code = require('code');
const Fs = require('fs');
const Hoek = require('hoek');
const Lab = require('lab');
const Broadcast = require('../lib/cli');
const Log = require('../lib/log');
const TestHelpers = require('./test_helpers');
const Utils = require('../lib/utils');
require('./cleanup');


// Test shortcuts

const lab = exports.lab = Lab.script();
const expect = Code.expect;
const describe = lab.describe;
const it = lab.it;

// Declare internals

const internals = {
    getFrames: function (filter) {

        const stack = new Error().stack.split('\n');
        return stack.filter((item) => {

            return item.indexOf(filter) > -1;
        });
    }
};


describe('Broadcast', () => {

    describe('options', () => {

        it('accepts a configuration object (-c)', (done) => {

            const server = TestHelpers.createTestServer((request, reply) => {

                expect(request.payload.schema).to.equal('good.v1');
                expect(request.payload.events[1].id).to.equal('1369328753222-42369-62002');
                reply().code(200);
            });

            server.start(() => {

                const original = Utils.recursiveAsync;
                const config = TestHelpers.writeConfig({
                    url: server.info.uri,
                    log: './test/fixtures/test_01.log'
                });

                Utils.recursiveAsync = function (init, iterator, error) {

                    expect(init.start).to.equal(0);
                    expect(init.result.stats).to.exist();
                    expect(init.previous.stats).to.exist();

                    iterator(init, (err, value) => {

                        expect(err).to.not.exist();
                        expect(value.start).to.equal(503);
                        expect(init.result.stats).to.exist();
                        expect(init.previous.stats).to.exist();

                        Utils.recursiveAsync = original;
                        Fs.unlinkSync(config);
                        done();
                    });
                };

                Broadcast.run(['-c', config]);
            });
        });

        it('exits for an invalid configuration object (-c)', (done) => {

            const config = TestHelpers.uniqueFilename();
            const configObj = {
                url: 'http://127.0.0.1:31337',
                log: './test/fixtures/test_01.log'
            };
            const log = console.error;
            const exit = process.exit;

            console.error = function (value) {

                expect(value).to.equal('Invalid JSON config file: ' + config);
            };

            process.exit = function (code) {

                expect(code).to.equal(1);
                process.exit = exit;
                console.error = log;

                done();
            };

            let json = JSON.stringify(configObj);
            json = json.substring(0, json.length - 3);

            Fs.writeFileSync(config, json);

            Broadcast.run(['-c', config]);
        });

        it('logs validation errors', (done) => {

            const log = console.error;
            const exit = process.exit;
            const config = TestHelpers.writeConfig({
                url: 'http://127.0.0.1:31338',
                interval: 10
            });
            let output = '';

            console.error = function (value) {

                output += value;
            };

            process.exit = function (code) {

                expect(code).to.equal(1);
                expect(output).to.contain('"interval" must be larger than or equal to 1000');
                console.log = log;
                process.exit = exit;
                done();
            };

            Broadcast.run(['--config', config]);
        });

        it('exits for invalid arguments as an option argument', (done) => {

            const log = console.error;
            const exit = process.exit;

            console.error = function (value) {

                console.error = log;
                expect(value).to.equal('-c or --config option must be present and be a valid file path');
            };

            process.exit = function (code) {

                process.exit = exit;
                expect(code).to.equal(1);
                done();
            };

            Broadcast.run(['-t', 1]);
        });

    });

    describe('broadcast', () => {

        it('sends a message to the supplied url', (done) => {

            const server = TestHelpers.createTestServer((request, reply) => {

                expect(request.payload.events).to.equal('test event');
                reply(200);
            });

            const write = process.stdout.write;

            process.stdout.write = function (chunk, encoding, cb) {

                process.stdout.write = write;
                const result = ~~(chunk.toString());
                expect(result).to.equal(200);
            };

            server.start(() => {

                Broadcast.broadcast('test event', {
                    url: server.info.uri,
                    attempts: 1,
                    wait: 1000
                }, (err) => {

                    expect(err).to.not.exist();
                    done();
                });
            });

        });

        it('does not send empty log messages', (done) => {

            Broadcast.broadcast('', {
                url: 'http://localhost:127.0.0.1:1',
                attempts: 1,
                wait: 1000
            }, (err) => {

                expect(err).to.not.exist();
                done();
            });
        });

        it('logs an error if there is a problem with Wreck', (done) => {

            const log = console.log;
            const info = console.info;

            console.log = function (value) {

                expect(value).to.exist();
                expect(value.output.statusCode).to.equal(502);
            };

            console.info = function (value) {

                expect(value).to.equal('Retrying broadcast in %s milliseconds');
            };

            Broadcast.broadcast('test message', {
                url: 'http://localhost:127.0.0.1:1',
                attempts: 1,
                wait: 1000
            }, () => {

                console.log = log;
                console.info = info;

                done();
            });
        });
    });

    describe('resume', () => {

        it('creates the file indicated by resumePath', (done) => {

            const server = TestHelpers.createTestServer((request, reply) => {

                expect(request.payload.events.length).to.equal(2);
                reply().code(200);
            });
            const resume = TestHelpers.uniqueFilename();

            server.start(() => {

                const original = Utils.recursiveAsync;
                const config = TestHelpers.writeConfig({
                    url: server.info.uri,
                    log: './test/fixtures/test_01.log',
                    resumePath: resume
                });

                Utils.recursiveAsync = function (init, iterator, callback) {

                    expect(init.start).to.equal(0);
                    expect(init.result.stats).to.exist();
                    expect(init.previous.stats).to.exist();

                    iterator(init, (value, next) => {

                        const file = Fs.readFileSync(resume, {
                            encoding: 'utf8'
                        });
                        expect(file).to.equal('503');
                        Utils.recursiveAsync = original;

                        done();
                    });
                };

                Broadcast.run(['-c', config]);
            });
        });

        it('logs an error trying to create the index file', (done) => {

            const server = TestHelpers.createTestServer((request, reply) => {

                reply().code(200);
            });
            const open = Fs.open;
            const log = console.error;
            const file = TestHelpers.uniqueFilename();
            server.start(() => {

                const config = TestHelpers.writeConfig({
                    log: './test/fixtures/test_01.log',
                    url: server.info.uri,
                    resumePath: file
                });

                Fs.open = function (path, flags, callback) {

                    const end = internals.getFrames('.logLastIndex');

                    if  (end.length) {
                        Fs.open = open;
                        callback(new Error('mock error'));
                    }
                    else {
                        open.apply(null, arguments);
                    }
                };

                console.error = function (value) {

                    expect(value.message).to.equal('mock error');
                    console.error = log;

                    done();
                };

                Broadcast.run(['-c', config]);
            });
        });

        it('will start reading from 0 if there is a problem with the index file', (done) => {

            const server = TestHelpers.createTestServer((request, reply) => {

                reply().code(200);
            });
            server.start(() => {

                const config = TestHelpers.writeConfig({
                    log: './test/fixtures/test_01.log',
                    url: server.info.uri,
                    resumePath: '~'
                });

                const original = Utils.recursiveAsync;

                Utils.recursiveAsync = function (init, iterator, callback) {

                    Utils.recursiveAsync = original;
                    expect(init.start).to.equal(0);

                    done();
                };

                Broadcast.run(['-c', config]);
            });

        });

        it('starts reading from the last index file', (done) => {

            const server = TestHelpers.createTestServer((request, reply) => {

                expect(request.payload.events.length).to.equal(1);
                reply().code(200);
            });
            const resume = TestHelpers.uniqueFilename();
            Fs.writeFileSync(resume, 252);

            server.start(() => {

                const original = Utils.recursiveAsync;
                const config = TestHelpers.writeConfig({
                    url: server.info.uri,
                    log: './test/fixtures/test_01.log',
                    resumePath: resume
                });

                Utils.recursiveAsync = function (init, iterator, callback) {

                    expect(init.start).to.equal(252);
                    expect(init.result.stats).to.exist();
                    expect(init.previous.stats).to.exist();

                    iterator(init, (value, next) => {

                        const file = Fs.readFileSync(resume, {
                            encoding: 'utf8'
                        });
                        expect(file).to.equal('503');
                        Utils.recursiveAsync = original;

                        done();
                    });
                };

                Broadcast.run(['-c', config]);
            });
        });

    });

    describe('recursive logic', () => {

        it('logs an error if there is an async error', (done) => {

            const original = Utils.recursiveAsync;
            const log = console.error;
            const info = console.info;
            const exit = process.exit;
            let output = '';
            const config = TestHelpers.writeConfig({
                log: './test/fixtures/test_01.log',
                url: 'http://127.0.0.1:9001'
            });

            console.error = function (error) {

                output += error.message || error;
            };

            console.info = function (value) {

                expect(value).to.equal('Retrying broadcast in %s milliseconds');
            };

            process.exit = function (code) {

                expect(code).to.equal(1);
                expect(output).to.contain('async error');

                process.exit = exit;
                Utils.recursiveAsync = original;
                console.error = log;
                console.info = info;

                done();
            };

            Utils.recursiveAsync = function (init, iterator, callback) {

                iterator(init, (value, error) => {

                    callback(new Error('async error'));
                });
            };

            Broadcast.run(['-c', config]);
        });

        it('logs an error if there is a I/O error', (done) => {

            const original = Utils.recursiveAsync;
            const log = console.error;
            const stat = Fs.stat;

            const config = TestHelpers.writeConfig({
                log: './test/fixtures/test_01.log',
                url: 'http://127.0.0.1:9001'
            });

            Utils.recursiveAsync = function (init, iterator, callback) {

                Fs.stat = function (path, cb) {

                    Fs.stat = stat;
                    cb('simulated Fs error');
                };

                console.error = function (error) {

                    console.error = log;
                    expect(error).to.equal('simulated Fs error');
                };


                iterator(init, (error, value) => {

                    expect(error).to.equal(null);
                    Utils.recursiveAsync = original;
                    done();
                });
            };

            Broadcast.run(['-c', config]);
        });

        it('cleans up when the final callback executes, even without an error', (done) => {

            const original = Utils.recursiveAsync;
            const exit = process.exit;
            const config = TestHelpers.writeConfig({
                log: './test/fixtures/test_01.log',
                url: 'http://127.0.0.1:1'
            });

            process.exit = function (code) {

                expect(code).to.equal(1);
                process.exit = exit;

                Utils.recursiveAsync = original;
                done();
            };

            Utils.recursiveAsync = function (init, iterator, callback) {

                callback(null);
            };

            Broadcast.run(['-c', config]);
        });

        it('uses the newer file if the lengths are the same', (done) => {

            const original = Utils.recursiveAsync;
            const get = Log.get;
            const config = TestHelpers.writeConfig({
                log: './test/fixtures/test_01.log',
                url: 'http://127.0.0.1:1'
            });


            Utils.recursiveAsync = function (init, iterator, callback) {

                init.start = 100;

                // Make a clone so we don't change previous at the same time.
                init.result = Hoek.clone(init.result);
                init.result.stats.mtime = new Date();

                Log.get = function (logPath, start, cb) {

                    // Start gets reset because the file has changed but the length is the same
                    expect(logPath).to.equal('./test/fixtures/test_01.log');
                    expect(start).to.equal(0);

                    Log.get = get;
                    Utils.recursiveAsync = original;
                    done();
                };

                iterator(init, () => {});
            };

            Broadcast.run(['-c', config]);
        });

        it('starts from the beginning of log file if it has been truncated', (done) => {

            const log = TestHelpers.uniqueFilename();
            let runCount = 0;
            const server = TestHelpers.createTestServer((request, reply) => {

                const id = Hoek.reach(request, 'payload.events.0.id');

                expect(request.payload.schema).to.equal('good.v1');
                if (runCount++ === 0) {

                    expect(id).to.equal(TestHelpers.inlineLogEntry.lineTwo.id);

                    Fs.stat(log, (err, stat) => {

                        expect(err).to.not.exist();
                        Fs.truncate(log, stat.size, (err) => {

                            expect(err).to.not.exist();
                            Fs.writeFileSync(log, TestHelpers.inlineLogEntry.lineThree.toString());
                        });
                    });
                }
                else {

                    expect(id).to.equal(TestHelpers.inlineLogEntry.lineThree.id);
                    done();
                }
                reply().code(200);
            });

            server.start(() => {

                const url = server.info.uri;
                const config = TestHelpers.writeConfig({
                    log: log,
                    url: url
                });

                Fs.writeFileSync(log, TestHelpers.inlineLogEntry.lineTwo.toString());

                Broadcast.run(['-c', config]);

            });

        });

        it('will start reading from the end of the log file if newOnly is true', (done) => {

            const config = TestHelpers.writeConfig({
                log: './test/fixtures/test_01.log',
                url: 'http://127.0.0.1:9001',
                newOnly: true
            });

            const original = Utils.recursiveAsync;

            Utils.recursiveAsync = function (init, iterator, callback) {

                Utils.recursiveAsync = original;
                expect(init.start).to.equal(502);

                done();
            };

            Broadcast.run(['-c', config]);

        });
    });


    it('provides an empty stats object if the file can not be opened', (done) => {

        const config = TestHelpers.writeConfig({
            log: './test/fixtures/test_01.log',
            url: 'http://127.0.0.1:9001'
        });

        const original = Utils.recursiveAsync;
        const stat = Fs.stat;

        Fs.stat = function (path, callback) {

            Fs.stat = stat;
            callback(null, null);
        };

        Utils.recursiveAsync = function (init, iterator, callback) {

            Utils.recursiveAsync = original;
            expect(init.result.stats).to.equal({});
            expect(init.result.stats).to.equal({});

            done();
        };

        Broadcast.run(['-c', config]);

    });
});
