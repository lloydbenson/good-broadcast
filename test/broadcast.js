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
var before = lab.before;
var after = lab.after;
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

        it('accepts the command line style arguments', function (done) {

            var server = TestHelpers.createTestServer(function (request, reply) {

                expect(request.payload.schema).to.equal('good.v1');
                expect(request.payload.events[1].id).to.equal('1369328753222-42369-62002');
            });

            server.start(function () {
                var original = Utils.recursiveAsync;

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
                        done();
                    });
                };

                Broadcast.run(['-l','./test/fixtures/test_01.log','-u', server.info.uri]);
            });
        });

        it('accepts an argument object', function (done) {

            var server = TestHelpers.createTestServer(function (request, reply) {

                expect(request.payload.schema).to.equal('good.v1');
                expect(request.payload.events[1].id).to.equal('1369328753222-42369-62002');
            });

            server.start(function () {

                var original = Utils.recursiveAsync;

                Utils.recursiveAsync = function (init, iterator, callback) {

                    expect(init.start).to.equal(0);
                    expect(init.result.stats).to.exist;
                    expect(init.previous.stats).to.exist;

                    iterator(init, function (error, value) {

                        expect(error).to.not.exist;
                        expect(value.start).to.equal(503);
                        expect(init.result.stats).to.exist;
                        expect(init.previous.stats).to.exist;

                        Utils.recursiveAsync = original;
                        done();
                    });
                };

                Broadcast.run({
                    path: './test/fixtures/test_01.log',
                    url: server.info.uri
                });
            });
        });

        it('accepts a configuration object (-c)', function (done) {
            var config = TestHelpers.uniqueFilename();
            var server = TestHelpers.createTestServer(function (request, reply) {

                expect(request.payload.schema).to.equal('good.v1');
                expect(request.payload.events[1].id).to.equal('1369328753222-42369-62002');
            });

            server.start(function () {

                var original = Utils.recursiveAsync;

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

                var configObj = {
                    url: server.info.uri,
                    path: './test/fixtures/test_01.log'
                };

                Fs.writeFileSync(config, JSON.stringify(configObj));

                Broadcast.run(['-c', config]);

            });
        });

        it('throws an error for an invalid configuration object (-c)', function (done) {
            var config = TestHelpers.uniqueFilename();
            var configObj = {
                url: 'http://127.0.0.1:31337',
                path: './test/fixtures/test_01.log'
            };
            var log = console.error;

            console.error = function (value) {

                expect(value).to.equal('Invalid JSON config file: ' + config);
            };

            var json = JSON.stringify(configObj);
            json = json.substring(0, json.length -3);

            Fs.writeFileSync(config, json);

            expect(function() {

                Broadcast.run(['-c', config]);
            }).to.throw('Unexpected end of input');

            Fs.unlinkSync(config);
            console.error = log;
            done();
        });

        it('prints the arguments with -h', function (done) {

            var exit = process.exit;
            var log = console.error;

            process.exit = function (code) {

                expect(code).to.equal(0);
                process.exit = exit;
                console.error = log;
                done();
            };
            console.error = function (value) {

                expect(value).to.contain('good-broadcast [options]');
            };

            Broadcast.run(['-h']);

        });

        it('display validation errors running from the command line', function (done) {
            var log = console.error;
            var exit = process.exit;
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

            Broadcast.run(['-u', 'http://127.0.0.1:31338', '-i', '10']);
        });

        it('throws an error for invalid arguments as an option argument', function (done) {

            expect(function() {

                Broadcast.run({});
            }).to.throw(Error);
            done();
        });
    });

    describe('broadcast', function() {

        it('sends a message to the supplied url', function (done) {

            var server = TestHelpers.createTestServer(function (request, reply) {

                expect(request.payload.events).to.equal('test event');
                reply(200);
                done();
            });

            var log = console.log;

            console.log = function (value) {

                expect(value).to.equal(200);
                console.log = log;
                done();
            };

            server.start(function () {

                Broadcast.broadcast('test event', server.info.uri);
            });

        });

        it('does not send empty log messages', function (done) {

            var log = console.error;

            console.error = function (value) {

                expect(value).to.not.exist;
            };

            var result = Broadcast.broadcast('', 'http://localhost:127.0.0.1:1');

            expect(result).to.not.exist;
            console.error = log;
            done();
        });

        it('logs an error if there is a problem with Wreck', function (done) {

            var log = console.error;

            console.error = function (value) {

                expect(value).to.exist;
                expect(value.output.statusCode).to.equal(502);

                console.error = log;
                done();
            };

            Broadcast.broadcast('test message', 'http://localhost:127.0.0.1:1');

        });

    });

    describe('last index', function () {

        it('honors the -p argument', function (done) {

            var server = TestHelpers.createTestServer(function (request, reply) {
                expect(request.payload.events.length).to.equal(2);
            });
            var lastIndex = TestHelpers.uniqueFilename();

            server.start(function () {
                var original = Utils.recursiveAsync;

                Utils.recursiveAsync = function (init, iterator, callback) {

                    expect(init.start).to.equal(0);
                    expect(init.result.stats).to.exist;
                    expect(init.previous.stats).to.exist;

                    iterator(init, function (value, next) {

                        var file = Fs.readFileSync(lastIndex, {
                            encoding: 'utf8'
                        });
                        expect(file).to.equal('503');
                        Utils.recursiveAsync = original;
                        done();
                    });
                };

                Broadcast.run({
                    path: './test/fixtures/test_01.log',
                    url: server.info.uri,
                    useLastIndex: true,
                    lastIndexPath: lastIndex
                });
            });
        });

        it('logs an error trying to create the index file', function (done) {

            var open = Fs.open;
            var log = console.error;
            var file = TestHelpers.uniqueFilename();

            Fs.open = function (path, flags, callback) {

                var end = internals.getFrames('.logLastIndex');

                if  (end.length) {
                    Fs.open = open;
                    callback(new Error('mock error'), undefined);
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

            Broadcast.run({
                path: './test/fixtures/test_01.log',
                url: 'http://127.0.0.1:1',
                useLastIndex: true,
                lastIndexPath: file
            });

        });
    });

    describe('recursive logic', function () {

        it('logs an error if there is an async error', function (done) {

            var original = Utils.recursiveAsync;
            var log = console.error;
            var exit = process.exit;
            var output = '';

            console.error = function (error) {

                output += error.message || error;
            };

            process.exit = function (code) {

                expect(code).to.equal(1);
                expect(output).to.contain('async error');

                process.exit = exit;
                Utils.recursiveAsync = original;
                console.error = log;

                done();
            };

            Utils.recursiveAsync = function (init, iterator, callback) {

                iterator(init, function (value, error) {

                    callback(new Error('async error'));
                });
            };

            Broadcast.run({
                path: './test/fixtures/test_01.log',
                url: 'http://127.0.0.1:9001'
            });
        });

        it('cleans up when the final callback executes, even without an error', function (done) {

            var original = Utils.recursiveAsync;
            var exit = process.exit;

            process.exit = function (code) {

                expect(code).to.equal(1);
                process.exit = exit;

                Utils.recursiveAsync = original;
                done();
            };

            Utils.recursiveAsync = function (init, iterator, callback) {

                callback(null);
            };

            Broadcast.run({
                path: './test/fixtures/test_01.log',
                url: 'http://127.0.0.1:1'
            });
        });

        it('uses the newer file if the lengths are the same', function (done) {

            var original = Utils.recursiveAsync;
            var get = Log.get;


            Utils.recursiveAsync = function (init, iterator, callback) {

                init.start = 100;

                // Make a close so we don't change previous at the same time.
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

            Broadcast.run({
                path: './test/fixtures/test_01.log',
                url: 'http://127.0.0.1:1'
            });
        });
    });

});
