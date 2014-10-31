//Load modules

var Lab = require('lab');
var Broadcast = require('../lib/cli');
var Utils = require('../lib/utils');
var TestHelpers = require('./test_helpers');
var Fs = require('fs');
var Hoek = require('hoek');
var Log = require('../lib/log');

require('./cleanup');


// Test shortcuts

var lab = exports.lab = Lab.script();
var expect = Lab.expect;
var describe = lab.describe;
var it = lab.it;

// Declare internals

var internals = {
    getFrames: function(filter) {

        var stack = new Error().stack.split('\n');
        return stack.filter(function (item) {

           return item.indexOf(filter) > -1;
        });
    }
};


describe('Broadcast', function () {

    describe('options', function () {

        it('accepts a configuration object (-c)', function (done) {

            var server = TestHelpers.createTestServer(function (request, reply) {

                expect(request.payload.schema).to.equal('good.v1');
                expect(request.payload.events[1].id).to.equal('1369328753222-42369-62002');
                reply().code(200);
            });

            server.start(function () {

                var original = Utils.recursiveAsync;
                var config = TestHelpers.writeConfig({
                    url: server.info.uri,
                    log: './test/fixtures/test_01.log'
                });

                Utils.recursiveAsync = function (init, iterator, error) {

                    expect(init.start).to.equal(0);
                    expect(init.result.stats).to.exist;
                    expect(init.previous.stats).to.exist;

                    iterator(init, function (error, value) {

                        expect(error).to.not.exist;
                        expect(value.start).to.equal(503);
                        expect(init.result.stats).to.exist;
                        expect(init.previous.stats).to.exist;

                        Utils.recursiveAsync = original;
                        Fs.unlinkSync(config);
                        done();
                    });
                };

                Broadcast.run(['-c', config]);
            });
        });

        it('exits for an invalid configuration object (-c)', function (done) {
            var config = TestHelpers.uniqueFilename();
            var configObj = {
                url: 'http://127.0.0.1:31337',
                log: './test/fixtures/test_01.log'
            };
            var log = console.error;
            var exit = process.exit;

            console.error = function (value) {

                expect(value).to.equal('Invalid JSON config file: ' + config);
            };

            process.exit = function (code) {

                expect(code).to.equal(1);
                process.exit = exit;
                console.error = log;

                done();
            };

            var json = JSON.stringify(configObj);
            json = json.substring(0, json.length -3);

            Fs.writeFileSync(config, json);

            Broadcast.run(['-c', config]);
        });

        it('logs validation errors', function (done) {

            var log = console.error;
            var exit = process.exit;
            var config = TestHelpers.writeConfig({
                url: 'http://127.0.0.1:31338',
                interval: 10
            });
            var output = '';

            console.error = function (value) {

                output += value;
            };

            process.exit = function (code) {

                expect(code).to.equal(1);
                expect(output).to.contain('interval must be larger than or equal to 1000');
                console.log = log;
                process.exit = exit;
                done();
            };

            Broadcast.run(['--config', config]);
        });

        it('exits for invalid arguments as an option argument', function (done) {

            var log = console.error;
            var exit = process.exit;

            console.error = function(value) {

                console.error = log;
                expect(value).to.equal('-c or --config option must be present and be a valid file path');
            };

            process.exit = function(code) {

                process.exit = exit;
                expect(code).to.equal(1);
                done();
            };

            Broadcast.run(['-t', 1]);
        });

    });

    describe('broadcast', function() {

        it('sends a message to the supplied url', function (done) {

            var server = TestHelpers.createTestServer(function (request, reply) {

                expect(request.payload.events).to.equal('test event');
                reply(200);
            });

            var write = process.stdout.write;

            process.stdout.write = function (chunk, encoding, cb) {

                process.stdout.write = write;
                var result = ~~(chunk.toString());
                expect(result).to.equal(200);
            };

            server.start(function () {

                Broadcast.broadcast('test event', {
                    url: server.info.uri,
                    attempts: 1,
                    wait: 1000
                }, function (err) {

                    expect(err).to.not.exist;
                    done();
                });
            });

        });

        it('does not send empty log messages', function (done) {

            Broadcast.broadcast('', {
                url: 'http://localhost:127.0.0.1:1',
                attempts: 1,
                wait: 1000
            }, function (err) {

                expect(err).to.not.exist;
                done();
            });
        });

        it('logs an error if there is a problem with Wreck', function (done) {

            var log = console.error;
            var info = console.info;

            console.error = function (value) {

                expect(value).to.exist;
                expect(value.output.statusCode).to.equal(502);
            };

            console.info = function(value) {

                expect(value).to.equal('Retrying broadcast in %s milliseconds');
            };

            Broadcast.broadcast('test message', {
                url: 'http://localhost:127.0.0.1:1',
                attempts: 1,
                wait: 1000
            }, function () {

                console.log = log;
                console.info = info;

                done();
            });
        });
    });

    describe('resume', function () {

        it('creates the file indicated by resumePath', function (done) {

            var server = TestHelpers.createTestServer(function (request, reply) {

                expect(request.payload.events.length).to.equal(2);
                reply().code(200);
            });
            var resume = TestHelpers.uniqueFilename();

            server.start(function () {
                var original = Utils.recursiveAsync;
                var config = TestHelpers.writeConfig({
                    url: server.info.uri,
                    log: './test/fixtures/test_01.log',
                    resumePath: resume
                });

                Utils.recursiveAsync = function (init, iterator, callback) {

                    expect(init.start).to.equal(0);
                    expect(init.result.stats).to.exist;
                    expect(init.previous.stats).to.exist;

                    iterator(init, function (value, next) {

                        var file = Fs.readFileSync(resume, {
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

        it('logs an error trying to create the index file', function (done) {

            var server = TestHelpers.createTestServer(function (request, reply) {

                reply().code(200);
            });
            var open = Fs.open;
            var log = console.error;
            var file = TestHelpers.uniqueFilename();
            server.start(function() {

                var config = TestHelpers.writeConfig({
                    log: './test/fixtures/test_01.log',
                    url: server.info.uri,
                    resumePath: file
                });

                Fs.open = function (path, flags, callback) {

                    var end = internals.getFrames('.logLastIndex');

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

        it('will start reading from 0 if there is a problem with the index file', function (done) {

            var server = TestHelpers.createTestServer(function (request, reply) {

                reply().code(200);
            });
            server.start(function () {

                var config = TestHelpers.writeConfig({
                    log: './test/fixtures/test_01.log',
                    url: server.info.uri,
                    resumePath: '~'
                });

                var original = Utils.recursiveAsync;

                Utils.recursiveAsync = function (init, iterator, callback) {

                    Utils.recursiveAsync = original;
                    expect(init.start).to.equal(0);

                    done();
                };

                Broadcast.run(['-c', config]);
            });

        });

        it('starts reading from the last index file', function (done) {

            var server = TestHelpers.createTestServer(function (request, reply) {

                expect(request.payload.events.length).to.equal(1);
                reply().code(200);
            });
            var resume = TestHelpers.uniqueFilename();
            Fs.writeFileSync(resume, 252);

            server.start(function () {

                var original = Utils.recursiveAsync;
                var config = TestHelpers.writeConfig({
                    url: server.info.uri,
                    log: './test/fixtures/test_01.log',
                    resumePath: resume
                });

                Utils.recursiveAsync = function (init, iterator, callback) {

                    expect(init.start).to.equal(252);
                    expect(init.result.stats).to.exist;
                    expect(init.previous.stats).to.exist;

                    iterator(init, function (value, next) {

                        var file = Fs.readFileSync(resume, {
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

    describe('recursive logic', function () {

        it('logs an error if there is an async error', function (done) {

            var original = Utils.recursiveAsync;
            var log = console.error;
            var info = console.info;
            var exit = process.exit;
            var output = '';
            var config = TestHelpers.writeConfig({
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

                iterator(init, function (value, error) {

                    callback(new Error('async error'));
                });
            };

            Broadcast.run(['-c', config]);
        });

        it('logs an error if there is a I/O error', function (done) {

            var original = Utils.recursiveAsync;
            var log = console.error;
            var stat = Fs.stat;

            var config = TestHelpers.writeConfig({
                log: './test/fixtures/test_01.log',
                url: 'http://127.0.0.1:9001'
            });

            Utils.recursiveAsync = function (init, iterator, callback) {

                Fs.stat = function (path, callback) {

                    Fs.stat = stat;
                    callback('simulated Fs error');
                };

                console.error = function (error) {

                    console.error = log;
                    expect(error).to.equal('simulated Fs error');
                };


                iterator(init, function (error, value) {

                    expect(error).to.equal(null);
                    Utils.recursiveAsync = original;
                    done();
                });
            };

            Broadcast.run(['-c', config]);
        });

        it('cleans up when the final callback executes, even without an error', function (done) {

            var original = Utils.recursiveAsync;
            var exit = process.exit;
            var config = TestHelpers.writeConfig({
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

        it('uses the newer file if the lengths are the same', function (done) {

            var original = Utils.recursiveAsync;
            var get = Log.get;
            var config = TestHelpers.writeConfig({
                log: './test/fixtures/test_01.log',
                url: 'http://127.0.0.1:1'
            });


            Utils.recursiveAsync = function (init, iterator, callback) {

                init.start = 100;

                // Make a clone so we don't change previous at the same time.
                init.result = Hoek.clone(init.result);
                init.result.stats.mtime = new Date();

                Log.get = function (logPath, start, callback) {

                    // Start gets reset because the file has changed but the length is the same
                    expect(logPath).to.equal('./test/fixtures/test_01.log');
                    expect(start).to.equal(0);

                    Log.get = get;
                    Utils.recursiveAsync = original;
                    done();
                };

                iterator(init, function () {});
            };

            Broadcast.run(['-c', config]);
        });

        it('starts from the beginning of log file if it has been truncated', function (done) {

            var log = TestHelpers.uniqueFilename();
            var runCount = 0;
            var server = TestHelpers.createTestServer(function (request, reply) {

                var id = Hoek.reach(request, 'payload.events.0.id');

                expect(request.payload.schema).to.equal('good.v1');
                if (runCount++ === 0) {

                    expect(id).to.equal(TestHelpers.inlineLogEntry.lineTwo.id);

                    Fs.stat(log, function (err, stat) {

                        expect(err).to.not.exist;
                        Fs.truncate(log, stat.size, function (err) {

                            expect(err).to.not.exist;
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

            server.start(function () {

                var url = server.info.uri;
                var config = TestHelpers.writeConfig({
                    log: log,
                    url: url
                });

                Fs.writeFileSync(log, TestHelpers.inlineLogEntry.lineTwo.toString());

                Broadcast.run(['-c', config]);

            });

        });

        it('will start reading from the end of the log file if newOnly is true', function (done) {

            var config = TestHelpers.writeConfig({
                log: './test/fixtures/test_01.log',
                url: 'http://127.0.0.1:9001',
                newOnly: true
            });

            var original = Utils.recursiveAsync;

            Utils.recursiveAsync = function (init, iterator, callback) {

                Utils.recursiveAsync = original;
                expect(init.start).to.equal(502);

                done();
            };

            Broadcast.run(['-c', config]);

        });
    });


    it('provides an empty stats object if the file can not be opened', function (done) {

            var config = TestHelpers.writeConfig({
                log: './test/fixtures/test_01.log',
                url: 'http://127.0.0.1:9001'
            });

            var original = Utils.recursiveAsync;
            var stat = Fs.stat;

            Fs.stat = function (path, callback) {

                Fs.stat = stat;
                callback(null, null);
            };

            Utils.recursiveAsync = function (init, iterator, callback) {

                Utils.recursiveAsync = original;
                expect(init.result.stats).to.deep.equal({});
                expect(init.result.stats).to.deep.equal({});

                done();
            };

            Broadcast.run(['-c', config]);

        });

});
