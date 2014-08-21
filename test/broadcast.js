// Load modules

var ChildProcess = require('child_process');
var Fs = require('fs');
var Lab = require('lab');
var Path = require('path');
var Hapi = require('hapi');
var Crypto = require('crypto');
var Hoek = require('hoek');


// Declare internals

var internals = {
    tempLogFolder: Path.join(__dirname, 'fixtures'),
    inlineLogEntry: {
        lineOne:{
            event: 'request',
            id: '1369328752975-42369-3828',
            instance: 'http://localhost:8080',
            labels: ['api','hapi'],
            method: 'get',
            path: '/test',
            query: {},
            responseTime: 71,
            source: {
                remoteAddress: '127.0.0.1'
            },
            statusCode: 200,
            timestamp: 1369328752975,
            toString: function() {
                return JSON.stringify(this);
            }
        },
        lineTwo:{
            event: 'request',
            id: '1369328753222-42369-62002',
            instance: 'http://localhost:8080',
            labels: ['api', 'hapi'],
            method: 'get',
            path: '/test',
            query: {},
            responseTime: 9,
            source: {
                remoteAddress: '127.0.0.1'
            },
            statusCode: 200,
            timestamp: 1369328753222,
            toString: function() {
                return JSON.stringify(this);
            }
        },
        lineThree: {
            event: 'request',
            id: '1469328953222-42369-1',
            instance: 'http://localhost:8080',
            labels: ['api', 'http'],
            method: 'get',
            path: '/test2',
            query: {},
            responseTime: 19,
            source: {
                remoteAddress: '127.0.0.1'
            },
            statusCode: 200,
            timestamp: 1469328953222,
            toString: function() {
                return JSON.stringify(this);
            }
        }
    }
};


// Test shortcuts

var lab = exports.lab = Lab.script();
var expect = Lab.expect;
var before = lab.before;
var after = lab.after;
var describe = lab.describe;
var it = lab.it;

internals.createServer = function (options, handler) {
    if (arguments.length === 1) {
        handler = options;
        options = {};
    }

    options = options || {};

    options.host = options.host || '127.0.0.1';
    options.port = options.port || 0;

    var server = Hapi.createServer(options.host, options.port);

    server.route({
        path: '/',
        method: 'POST',
        handler: handler
    });

    return server;
};


internals.uniqueFilename = function (path) {

    var name = [Date.now(), process.pid, Crypto.randomBytes(8).toString('hex')].join('-') + '.__test';
    return Path.join(path, name);
};


internals.cleanupLogFile = function (path, done) {
    return function(code) {
        expect(code).to.equal(0);
        Fs.unlinkSync(path);
        done();
    };
};


describe('Broadcast', function () {

    var broadcastPath = Path.join(__dirname, '..', 'bin', 'broadcast');

    it('sends log file to remote server', function (done) {


        var broadcast = null;
        var server = internals.createServer(function (request, reply) {

            expect(request.payload.schema).to.equal('good.v1');
            expect(request.payload.events[1].id).to.equal('1369328753222-42369-62002');
            broadcast.kill('SIGUSR2');
        });

        server.start(function () {

            var url = server.info.uri;

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-l', './test/fixtures/test_01.log', '-u', url, '-i', 1000]);
            broadcast.stderr.on('data', function (data) {

                expect(data.toString()).to.not.exist;
            });

            broadcast.once('close', function (code) {

                expect(code).to.equal(0);
                done();
            });
        });
    });

    it('handles a log file that grows', function (done) {
        var broadcast = null;
        var runCount = 0;
        var server = internals.createServer(function (request, reply) {
            var id = Hoek.reach(request, 'payload.events.0.id');

            expect(request.payload.schema).to.equal('good.v1');
            if (runCount++ === 0) {

                expect(id).to.equal(internals.inlineLogEntry.lineTwo.id);
            }
            else {

                expect(id).to.equal(internals.inlineLogEntry.lineThree.id);
                broadcast.kill('SIGUSR2');
            }
        });

        server.start(function () {

            var url = server.info.uri;
            var log = internals.uniqueFilename(internals.tempLogFolder);
            var stream = Fs.createWriteStream(log, { flags: 'a' });

            stream.write(internals.inlineLogEntry.lineTwo.toString());
            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-l', log, '-u', url, '-i', 1000]);
            broadcast.stderr.on('data', function (data) {

                expect(data.toString()).to.not.exist;
            });

            broadcast.once('close', internals.cleanupLogFile(log, done));

            setTimeout(function () {

                stream.write(internals.inlineLogEntry.lineThree.toString());
                stream.end();
            }, 300);
        });
    });

    it('handles a log file that gets truncated', function (done) {

        var log = internals.uniqueFilename(internals.tempLogFolder);
        var broadcast = null;
        var runCount = 0;
        var server = internals.createServer(function (request, reply) {

            var id = Hoek.reach(request, 'payload.events.0.id');

            expect(request.payload.schema).to.equal('good.v1');
            if (runCount++ === 0) {

                expect(id).to.equal(internals.inlineLogEntry.lineTwo.id);

                Fs.stat(log, function (err, stat) {

                    expect(err).to.not.exist;
                    Fs.truncate(log, stat.size, function (err) {

                        expect(err).to.not.exist;
                        Fs.writeFileSync(log, internals.inlineLogEntry.lineThree.toString());
                    });
                });
            }
            else {

                expect(id).to.equal(internals.inlineLogEntry.lineThree.id);
                broadcast.kill('SIGUSR2');
            }
        });

        server.start(function () {

            var url = server.info.uri;

            Fs.writeFileSync(log, internals.inlineLogEntry.lineTwo.toString());

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-l', log, '-u', url, '-i', 1000]);
            broadcast.stderr.on('data', function (data) {

                expect(data.toString()).to.not.exist;
            });

            broadcast.once('close', internals.cleanupLogFile(log, done));
        });
    });

    it('works when broadcast process is restarted', function (done) {

        var log = internals.uniqueFilename(internals.tempLogFolder);
        var broadcast1 = null;
        var broadcast2 = null;
        var runCount = 0;

        var server = internals.createServer(function (request, reply) {
            expect(request.payload.schema).to.equal('good.v1');
            if (runCount++ === 0) {

                expect(request.payload.events[0].id).to.equal(internals.inlineLogEntry.lineTwo.id);
                broadcast1 && broadcast1.kill('SIGUSR2');
            }
            else {

                expect(request.payload.events.length).to.be.greaterThan(0);
                broadcast2 && broadcast2.kill('SIGUSR2');
            }
        });

        server.start(function () {

            var url = server.info.uri;
            var stream = Fs.createWriteStream(log, { flags: 'a' });
            stream.write(internals.inlineLogEntry.lineTwo.toString());
            broadcast1 = ChildProcess.spawn(process.execPath, [broadcastPath, '-l', log, '-u', url, '-i', 1000]);
            broadcast1.stderr.on('data', function (data) {

                expect(data.toString()).to.not.exist;
            });

            broadcast1.once('close', function (code) {

                expect(code).to.equal(0);
                broadcast2 = ChildProcess.spawn(process.execPath, [broadcastPath, '-l', log, '-u', url, '-i', 1000]);
                broadcast2.stderr.on('data', function (data) {

                    expect(data.toString()).to.not.exist;
                });

                broadcast2.once('close', internals.cleanupLogFile(log, done));

                stream.write('\n' + internals.inlineLogEntry.lineThree.toString());
            });
        });
    });

    it('sends log file to remote server using a config file', function (done) {

        var config = internals.uniqueFilename(internals.tempLogFolder);
        var broadcast = null;
        var server = internals.createServer(function (request, reply) {

            expect(request.payload.schema).to.equal('good.v1');
            expect(request.payload.events[1].id).to.equal('1369328753222-42369-62002');

            broadcast.kill('SIGUSR2');
        });


        server.start(function () {

            var url = server.info.uri;
            var configObj = {
                url: url,
                path: './test/fixtures/test_01.log',
                interval: 1000
            };

            Fs.writeFileSync(config, JSON.stringify(configObj));
            //process.execPath = 'node-debug'
            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.on('data', function (data) {

                expect(data.toString()).to.not.exist;
            });

            broadcast.once('close', internals.cleanupLogFile(config, done));
        });
    });

    it('handles a log file that has the wrong format', function (done) {

        var log = internals.uniqueFilename(internals.tempLogFolder);
        var broadcast = null;
        var runCount = 0;
        var nextData = '{"event":"request","timestamp"' + ':1469328953222,"id":"1469328953222-42369-62002","instance":"http://localhost:8080","labels":["api","http"],"method":"get","path":"/test2","query":{},"source":' + '{"remoteAddress":"127.0.0.1"},"responseTime":19,"statusCode":200}';
        var server = internals.createServer(function (request, reply) {

            expect(request.payload.schema).to.equal('good.v1');

            if (runCount++ === 0) {
                expect(request.payload.events[0].id).to.equal('1469328953222-42369-62002');
            }
            broadcast.kill('SIGUSR2');
        });

        server.start(function () {

            var url = server.info.uri;

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-l', log, '-u', url, '-i', 1000]);
            broadcast.stderr.on('data', function (data) {

                expect(data.toString()).to.exist;
                broadcast.kill('SIGUSR2');
            });

            broadcast.once('close', internals.cleanupLogFile(log, done));
        });

        var stream = Fs.createWriteStream(log, { flags: 'a' });
        stream.write(internals.inlineLogEntry.lineOne.toString());
        stream.write(internals.inlineLogEntry.lineTwo.toString());

        setTimeout(function () {

            stream.write(nextData);
        }, 300);
    });

    it('handles connection errors to remote server', function (done) {

        var log = internals.uniqueFilename(internals.tempLogFolder);
        var broadcast = null;
        var runCount = 0;
        var stream = Fs.createWriteStream(log, { flags: 'a' });
        stream.write(internals.inlineLogEntry.lineTwo.toString());
        var server = internals.createServer(function (request, reply) {

            expect(request.payload.schema).to.equal('good.v1');
            if (runCount++ === 0) {

                expect(request.payload.events[0].id).to.equal(internals.inlineLogEntry.lineTwo.id);
                server.stop();
            }
        });

        server.start(function () {

            var url = server.info.uri;
            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-l', log, '-u', url, '-i', 1000]);
            broadcast.stderr.on('data', function (data) {

                expect(data.toString()).to.contain('ECONNREFUSED');
                broadcast.kill('SIGUSR2');
            });

            broadcast.once('close', internals.cleanupLogFile(log, done));

            setTimeout(function () {

                stream.write(internals.inlineLogEntry.lineThree.toString());
            }, 300);
        });
    });

    it('sends ops log file to remote server', function (done) {

        var broadcast = null;
        var server = internals.createServer(function (request, reply) {

            expect(request.payload.schema).to.equal('good.v1');
            expect(request.payload.events[0].timestamp).to.equal(1375466329196);
            broadcast.kill('SIGUSR2');
        });

        server.start(function () {

            var url = server.info.uri;
            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-l', './test/fixtures/test_ops.log', '-u', url, '-i', 1000]);
            broadcast.stderr.on('data', function (data) {

                expect(data.toString()).to.not.exist;
            });

            broadcast.once('close', function (code) {

                expect(code).to.equal(0);
                done();
            });
        });
    });

    it('handles a log file that exists when onlySendNew is enabled', function (done) {

        var log = internals.uniqueFilename(internals.tempLogFolder);
        var broadcast = null;

        var stream = Fs.createWriteStream(log, { flags: 'a' });
        stream.write(internals.inlineLogEntry.lineOne.toString());
        stream.write(internals.inlineLogEntry.lineTwo.toString());

        var server = internals.createServer(function (request, reply) {

            expect(request.payload.schema).to.equal('good.v1');
            expect(request.payload.events[0].id).to.equal(internals.inlineLogEntry.lineThree.id);
            broadcast.kill('SIGUSR2');
        });

        server.start(function () {

            var url = server.info.uri;
            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-l', log, '-u', url, '-i', 1000, '-n']);
            broadcast.stderr.on('data', function (data) {

                expect(data.toString()).to.not.exist;
            });

            broadcast.once('close', internals.cleanupLogFile(log, done));

            setTimeout(function () {

                stream.write(internals.inlineLogEntry.lineThree.toString());
            }, 300);
        });
    });

    it('honors -p (use last index) option for a new file', function (done) {

        var log = internals.uniqueFilename(internals.tempLogFolder);
        var stream = Fs.createWriteStream(log, { flags: 'a' });
        var broadcast1 = null;
        var broadcast2 = null;
        var hitCount = 0;
        var server = internals.createServer(function(request, reply) {

            hitCount++;
            expect(request.payload.schema).to.equal('good.v1');

            if (hitCount === 1) {
                expect(request.payload.events[0].id).to.equal(internals.inlineLogEntry.lineOne.id);

                broadcast1.kill('SIGUSR2');
                stream.write('\n' + internals.inlineLogEntry.lineThree.toString());
                stream.write('\n' + internals.inlineLogEntry.lineTwo.toString());

            }
            else {
                expect(request.payload.events.length).to.equal(2);
                expect(request.payload.events[0].id).to.equal(internals.inlineLogEntry.lineThree.id);
                expect(request.payload.events[1].id).to.equal(internals.inlineLogEntry.lineTwo.id);

                broadcast2.kill('SIGUSR2');
                server.kill();
            }

        });

        stream.write(internals.inlineLogEntry.lineOne.toString());

        server.start(function () {

            var url = server.info.uri;
            broadcast1 = ChildProcess.spawn(process.execPath, [broadcastPath, '-l', log, '-u', url, '-i', 1000]);
            broadcast1.stderr.on('data', function (data) {
console.log(data.toString())
                //expect(data.toString()).to.not.exist;
            });

            broadcast1.once('close', function (code) {

                expect(code).to.equal(0);

                broadcast2 = ChildProcess.spawn('node-debug', [broadcastPath, '-l', log, '-u', url, '-i', 1000, '-p']);

                broadcast2.stderr.on('data', function (data) {
console.log(data.toString())
                    //expect(data.toString()).to.not.exist;
                });

                broadcast2.once('close', internals.cleanupLogFile(log, done));
            });
        });

    });
});
