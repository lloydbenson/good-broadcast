// Load modules

var Code = require('code');
var ChildProcess = require('child_process');
var Fs = require('fs');
var Hoek = require('hoek');
var Lab = require('lab');
var Path = require('path');
var TestHelpers = require('./test_helpers');
require('./cleanup');


// Declare internals

var internals = {};


// Test shortcuts

var lab = exports.lab = Lab.script();
var expect = Code.expect;
var describe = lab.describe;
var it = lab.it;

describe('Broadcast', function () {

    var broadcastPath = Path.join(__dirname, '..', 'bin', 'broadcast');

    it('sends log file to remote server', function (done) {


        var broadcast = null;
        var server = TestHelpers.createTestServer(function (request, reply) {

            expect(request.payload.schema).to.equal('good.v1');
            expect(request.payload.events[1].id).to.equal('1369328753222-42369-62002');
            broadcast.kill('SIGUSR2');
        });

        server.start(function () {

            var url = server.info.uri;
            var config = TestHelpers.writeConfig({
                url: url,
                log:'./test/fixtures/test_01.log'
            });

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.on('data', function (data) {

                expect(data.toString()).to.not.exist();
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
        var server = TestHelpers.createTestServer(function (request, reply) {

            var id = Hoek.reach(request, 'payload.events.0.id');
            expect(request.payload.schema).to.equal('good.v1');
            if (runCount++ === 0) {

                expect(id).to.equal(TestHelpers.inlineLogEntry.lineTwo.id);
            }
            else {

                expect(id).to.equal(TestHelpers.inlineLogEntry.lineThree.id);
                broadcast.kill('SIGUSR2');
            }
            reply().code(200);
        });

        server.start(function () {

            var url = server.info.uri;
            var log = TestHelpers.uniqueFilename();
            var stream = Fs.createWriteStream(log, { flags: 'a' });
            var config = TestHelpers.writeConfig({
                log: log,
                url: url
            });

            stream.write(TestHelpers.inlineLogEntry.lineTwo.toString());
            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.on('data', function (data) {

                expect(data.toString()).to.not.exist();
            });

            broadcast.once('close', function (code) {

                expect(code).to.equal(0);
                done();
            });

            setTimeout(function () {

                stream.write(TestHelpers.inlineLogEntry.lineThree.toString());
                stream.end();
            }, 300);
        });
    });

    it('handles a log file that gets truncated', function (done) {

        var log = TestHelpers.uniqueFilename();
        var broadcast = null;
        var runCount = 0;
        var server = TestHelpers.createTestServer(function (request, reply) {

            var id = Hoek.reach(request, 'payload.events.0.id');

            expect(request.payload.schema).to.equal('good.v1');
            if (runCount++ === 0) {

                expect(id).to.equal(TestHelpers.inlineLogEntry.lineTwo.id);

                Fs.stat(log, function (err, stat) {

                    expect(err).to.not.exist();
                    Fs.truncate(log, stat.size, function (err) {

                        expect(err).to.not.exist();
                        Fs.writeFileSync(log, TestHelpers.inlineLogEntry.lineThree.toString());
                    });
                });
            }
            else {

                expect(id).to.equal(TestHelpers.inlineLogEntry.lineThree.id);
                broadcast.kill('SIGUSR2');
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

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.on('data', function (data) {

                expect(data.toString()).to.not.exist();
            });

            broadcast.once('close', function (code) {

                expect(code).to.equal(0);
                done();
            });
        });
    });

    it('works when broadcast process is restarted', function (done) {

        var log = TestHelpers.uniqueFilename();
        var broadcast1 = null;
        var broadcast2 = null;
        var runCount = 0;

        var server = TestHelpers.createTestServer(function (request, reply) {

            expect(request.payload.schema).to.equal('good.v1');
            if (runCount++ === 0) {

                expect(request.payload.events[0].id).to.equal(TestHelpers.inlineLogEntry.lineTwo.id);
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
            stream.write(TestHelpers.inlineLogEntry.lineTwo.toString());

            var config = TestHelpers.writeConfig({
                log: log,
                url: url
            });

            broadcast1 = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast1.stderr.on('data', function (data) {

                expect(data.toString()).to.not.exist();
            });

            broadcast1.once('close', function (code) {

                expect(code).to.equal(0);
                broadcast2 = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
                broadcast2.stderr.on('data', function (data) {

                    expect(data.toString()).to.not.exist();
                });

                broadcast2.once('close', function (onceCode) {

                    expect(onceCode).to.equal(0);
                    done();
                });

                stream.write('\n' + TestHelpers.inlineLogEntry.lineThree.toString());
            });
        });
    });

    it('handles a log file that has the wrong format', function (done) {

        var log = TestHelpers.uniqueFilename();
        var broadcast = null;
        var runCount = 0;
        var nextData = '{"event":"request","timestamp"' + ':1469328953222,"id":"1469328953222-42369-62002","instance":"http://localhost:8080","labels":["api","http"],"method":"get","path":"/test2","query":{},"source":' + '{"remoteAddress":"127.0.0.1"},"responseTime":19,"statusCode":200}';
        var server = TestHelpers.createTestServer(function (request, reply) {

            expect(request.payload.schema).to.equal('good.v1');

            if (runCount++ === 0) {
                expect(request.payload.events[0].id).to.equal('1469328953222-42369-62002');
            }
            broadcast.kill('SIGUSR2');
        });

        server.start(function () {

            var url = server.info.uri;
            var config = TestHelpers.writeConfig({
                url: url,
                log: log
            });

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.on('data', function (data) {

                expect(data.toString()).to.exist();
                broadcast.kill('SIGUSR2');
            });

            broadcast.once('close', function (code) {

                expect(code).to.equal(0);
                done();
            });
        });

        var stream = Fs.createWriteStream(log, { flags: 'a' });
        stream.write(TestHelpers.inlineLogEntry.lineOne.toString());
        stream.write(TestHelpers.inlineLogEntry.lineTwo.toString());

        setTimeout(function () {

            stream.write(nextData);
        }, 300);
    });

    it('handles connection errors to remote server', function (done) {

        var log = TestHelpers.uniqueFilename();
        var broadcast = null;
        var runCount = 0;
        var stream = Fs.createWriteStream(log, { flags: 'a' });
        stream.write(TestHelpers.inlineLogEntry.lineTwo.toString());
        var server = TestHelpers.createTestServer(function (request, reply) {

            expect(request.payload.schema).to.equal('good.v1');
            if (runCount++ === 0) {

                expect(request.payload.events[0].id).to.equal(TestHelpers.inlineLogEntry.lineTwo.id);
                reply().code(200);
                server.stop(Hoek.ignore);
            }
        });

        server.start(function () {

            var url = server.info.uri;
            var config = TestHelpers.writeConfig({
                log: log,
                url: url
            });

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.once('data', function (data) {

                expect(data.toString()).to.contain('ECONNREFUSED');
                broadcast.kill('SIGUSR2');
            });

            broadcast.once('close', function (code) {

                expect(code).to.equal(0);
                done();
            });

            setTimeout(function () {

                stream.write(TestHelpers.inlineLogEntry.lineThree.toString());
            }, 300);
        });
    });

    it('sends ops log file to remote server', function (done) {

        var broadcast = null;
        var server = TestHelpers.createTestServer(function (request, reply) {

            expect(request.payload.schema).to.equal('good.v1');
            expect(request.payload.events[0].timestamp).to.equal(1375466329196);
            broadcast.kill('SIGUSR2');
        });

        server.start(function () {

            var url = server.info.uri;
            var config = TestHelpers.writeConfig({
                log: './test/fixtures/test_ops.log',
                url: url
            });

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.on('data', function (data) {

                expect(data.toString()).to.not.exist();
            });

            broadcast.once('close', function (code) {

                expect(code).to.equal(0);
                done();
            });
        });
    });

    it('handles a log file that exists when newOnly is enabled', function (done) {

        var log = TestHelpers.uniqueFilename();
        var broadcast = null;

        var stream = Fs.createWriteStream(log, { flags: 'a' });
        stream.write(TestHelpers.inlineLogEntry.lineOne.toString());
        stream.write(TestHelpers.inlineLogEntry.lineTwo.toString());

        var server = TestHelpers.createTestServer(function (request, reply) {

            expect(request.payload.schema).to.equal('good.v1');
            expect(request.payload.events[0].id).to.equal(TestHelpers.inlineLogEntry.lineThree.id);
            broadcast.kill('SIGUSR2');
        });

        server.start(function () {

            var url = server.info.uri;
            var config = TestHelpers.writeConfig({
                log: log,
                url: url,
                newOnly: true
            });

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.on('data', function (data) {

                expect(data.toString()).to.not.exist();
            });

            broadcast.once('close', function (code) {

                expect(code).to.equal(0);
                done();
            });

            setTimeout(function () {

                stream.write(TestHelpers.inlineLogEntry.lineThree.toString());
            }, 300);
        });
    });

    it('honors resumePath option', function (done) {

        var log = TestHelpers.uniqueFilename();
        var lastIndex = TestHelpers.uniqueFilename();
        var stream = Fs.createWriteStream(log, { flags: 'a' });

        var broadcast1 = null;
        var broadcast2 = null;
        var hitCount = 0;
        var server = TestHelpers.createTestServer(function (request, reply) {

            hitCount++;
            expect(request.payload.schema).to.equal('good.v1');
            reply().code(200);

            if (hitCount === 1) {
                expect(request.payload.events[0].id).to.equal(TestHelpers.inlineLogEntry.lineOne.id);

                stream.write('\n' + TestHelpers.inlineLogEntry.lineThree.toString());
                stream.write('\n' + TestHelpers.inlineLogEntry.lineTwo.toString());

                // Need to give the write last index enough time to write itself
                setTimeout(function () {

                    broadcast1.kill('SIGUSR2');
                }, 100);

            }
            else {
                expect(request.payload.events.length).to.equal(2);
                expect(request.payload.events[0].id).to.equal(TestHelpers.inlineLogEntry.lineThree.id);
                expect(request.payload.events[1].id).to.equal(TestHelpers.inlineLogEntry.lineTwo.id);

                broadcast2.kill('SIGUSR2');
            }
        });

        stream.write(TestHelpers.inlineLogEntry.lineOne.toString());

        server.start(function () {

            var url = server.info.uri;
            var config = TestHelpers.writeConfig({
                log: log,
                url: url,
                resumePath: lastIndex
            });

            broadcast1 = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);

            broadcast1.stderr.on('data', function (data) {

                expect(data.toString()).to.not.exist();
            });

            broadcast1.once('close', function (code) {

                expect(code).to.equal(0);

                broadcast2 = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);

                broadcast2.stderr.on('data', function (data) {

                    expect(data.toString()).to.not.exist();
                });

                broadcast2.once('close', function (onceCode) {

                    expect(onceCode).to.equal(0);
                    done();
                });
            });
        });
    });
});
