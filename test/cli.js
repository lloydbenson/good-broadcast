'use strict';

const Code = require('code');
const ChildProcess = require('child_process');
const Fs = require('fs');
const Hoek = require('hoek');
const Lab = require('lab');
const Path = require('path');
const TestHelpers = require('./test_helpers');
require('./cleanup');

const internals = {};


const lab = exports.lab = Lab.script();
const expect = Code.expect;
const describe = lab.describe;
const it = lab.it;

describe('Broadcast', () => {

    const broadcastPath = Path.join(__dirname, '..', 'bin', 'broadcast');

    it('sends log file to remote server', (done) => {

        let broadcast = null;
        const server = TestHelpers.createTestServer((request, reply) => {

            expect(request.payload.schema).to.equal('good.v1');
            expect(request.payload.events[1].id).to.equal('1369328753222-42369-62002');
            broadcast.kill('SIGUSR2');
        });

        server.start(() => {

            const url = server.info.uri;
            const log = './test/fixtures/test_01.log';
            const config = TestHelpers.writeConfig({ url, log });

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.on('data', (data) => {

                expect(data.toString()).to.not.exist();
            });

            broadcast.once('close', (code) => {

                expect(code).to.equal(0);
                done();
            });
        });
    });

    it('handles a log file that grows', (done) => {

        let runCount = 0;
        let broadcast = null;

        const server = TestHelpers.createTestServer((request, reply) => {

            const id = Hoek.reach(request, 'payload.events.0.id');
            expect(request.payload.schema).to.equal('good.v1');

            if (runCount++ === 0) {
                expect(id).to.equal(TestHelpers.inlineLogEntry.lineTwo.id);
            }
            else {
                expect(id).to.equal(TestHelpers.inlineLogEntry.lineThree.id);
                broadcast.kill('SIGUSR2');
            }

            return reply().code(200);
        });

        server.start(() => {

            const url = server.info.uri;
            const log = TestHelpers.uniqueFilename();
            const stream = Fs.createWriteStream(log, { flags: 'a' });
            const config = TestHelpers.writeConfig({ url, log });

            stream.write(TestHelpers.inlineLogEntry.lineTwo.toString());
            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.on('data', (data) => {

                expect(data.toString()).to.not.exist();
            });

            broadcast.once('close', (code) => {

                expect(code).to.equal(0);
                done();
            });

            setTimeout(() => {

                stream.write(TestHelpers.inlineLogEntry.lineThree.toString());
                stream.end();
            }, 300);
        });
    });

    it('handles a log file that gets truncated', (done) => {

        let runCount = 0;
        let broadcast = null;
        const log = TestHelpers.uniqueFilename();

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
                broadcast.kill('SIGUSR2');
            }

            return reply().code(200);
        });

        server.start(() => {

            const url = server.info.uri;
            const config = TestHelpers.writeConfig({ url, log });

            Fs.writeFileSync(log, TestHelpers.inlineLogEntry.lineTwo.toString());

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.on('data', (data) => {

                expect(data.toString()).to.not.exist();
            });

            broadcast.once('close', (code) => {

                expect(code).to.equal(0);
                done();
            });
        });
    });

    it('works when broadcast process is restarted', (done) => {

        const log = TestHelpers.uniqueFilename();
        let broadcast1 = null;
        let broadcast2 = null;
        let runCount = 0;

        const server = TestHelpers.createTestServer((request, reply) => {

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

        server.start(() => {

            const url = server.info.uri;
            const stream = Fs.createWriteStream(log, { flags: 'a' });
            stream.write(TestHelpers.inlineLogEntry.lineTwo.toString());

            const config = TestHelpers.writeConfig({ url, log });
            broadcast1 = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);

            broadcast1.stderr.on('data', (data) => {

                expect(data.toString()).to.not.exist();
            });

            broadcast1.once('close', (code) => {

                expect(code).to.equal(0);
                broadcast2 = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
                broadcast2.stderr.on('data', (data) => {

                    expect(data.toString()).to.not.exist();
                });

                broadcast2.once('close', (onceCode) => {

                    expect(onceCode).to.equal(0);
                    done();
                });

                stream.write('\n' + TestHelpers.inlineLogEntry.lineThree.toString());
            });
        });
    });

    it('handles a log file that has the wrong format', (done) => {

        let runCount = 0;
        let broadcast = null;

        const log = TestHelpers.uniqueFilename();
        const nextData = '{"event":"request","timestamp"' + ':1469328953222,"id":"1469328953222-42369-62002","instance":"http://localhost:8080","labels":["api","http"],"method":"get","path":"/test2","query":{},"source":' + '{"remoteAddress":"127.0.0.1"},"responseTime":19,"statusCode":200}';
        const server = TestHelpers.createTestServer((request, reply) => {

            expect(request.payload.schema).to.equal('good.v1');

            if (runCount++ === 0) {
                expect(request.payload.events[0].id).to.equal('1469328953222-42369-62002');
            }

            broadcast.kill('SIGUSR2');
        });

        server.start(() => {

            const url = server.info.uri;
            const config = TestHelpers.writeConfig({ url, log });

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.on('data', (data) => {

                expect(data.toString()).to.exist();
                broadcast.kill('SIGUSR2');
            });

            broadcast.once('close', (code) => {

                expect(code).to.equal(0);
                done();
            });
        });

        const stream = Fs.createWriteStream(log, { flags: 'a' });
        stream.write(TestHelpers.inlineLogEntry.lineOne.toString());
        stream.write(TestHelpers.inlineLogEntry.lineTwo.toString());

        setTimeout(() => {

            stream.write(nextData);
        }, 300);
    });

    it('handles connection errors to remote server', (done) => {

        let runCount = 0;
        let broadcast = null;
        const log = TestHelpers.uniqueFilename();

        const stream = Fs.createWriteStream(log, { flags: 'a' });
        stream.write(TestHelpers.inlineLogEntry.lineTwo.toString());
        const server = TestHelpers.createTestServer((request, reply) => {

            expect(request.payload.schema).to.equal('good.v1');
            if (runCount++ === 0) {

                expect(request.payload.events[0].id).to.equal(TestHelpers.inlineLogEntry.lineTwo.id);
                reply().code(200);
                server.stop(Hoek.ignore);
            }
        });

        server.start(() => {

            const url = server.info.uri;
            const config = TestHelpers.writeConfig({ url, log });

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.once('data', (data) => {

                expect(data.toString()).to.contain('ECONNREFUSED');
                broadcast.kill('SIGUSR2');
            });

            broadcast.once('close', (code) => {

                expect(code).to.equal(0);
                done();
            });

            setTimeout(() => {

                stream.write(TestHelpers.inlineLogEntry.lineThree.toString());
            }, 300);
        });
    });

    it('sends ops log file to remote server', (done) => {

        let broadcast = null;
        const server = TestHelpers.createTestServer((request, reply) => {

            expect(request.payload.schema).to.equal('good.v1');
            expect(request.payload.events[0].timestamp).to.equal(1375466329196);
            broadcast.kill('SIGUSR2');
        });

        server.start(() => {

            const url = server.info.uri;
            const log = './test/fixtures/test_ops.log';
            const config = TestHelpers.writeConfig({ url, log });

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.on('data', (data) => {

                expect(data.toString()).to.not.exist();
            });

            broadcast.once('close', (code) => {

                expect(code).to.equal(0);
                done();
            });
        });
    });

    it('sends payload with no more than maxEvents', (done) => {

        let broadcast = null;
        let events = [];

        const server = TestHelpers.createTestServer((request, reply) => {

            expect(request.payload.schema).to.equal('good.v1');
            expect(request.payload.events).to.have.length(1);
            expect(request.payload.events[0].timestamp).to.exist();

            events = events.concat(request.payload.events);

            if (events.length === 2) {
                broadcast.kill('SIGUSR2');
            }

            return reply();
        });

        server.start(() => {

            const url = server.info.uri;
            const log = './test/fixtures/request.log';
            const config = TestHelpers.writeConfig({ url, log, maxEvents: 1 });

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.on('data', (data) => {

                expect(data.toString()).to.not.exist();
            });

            broadcast.once('close', (code) => {

                expect(code).to.equal(0);
                done();
            });
        });
    });

    it('sends payload with no more than maxSize', (done) => {

        let broadcast = null;
        let events = [];

        const server = TestHelpers.createTestServer((request, reply) => {

            expect(request.payload.schema).to.equal('good.v1');
            expect(request.payload.events).to.have.length(1);
            expect(request.payload.events[0].timestamp).to.exist();

            events = events.concat(request.payload.events);

            if (events.length === 2) {
                broadcast.kill('SIGUSR2');
            }

            return reply();
        });

        server.start(() => {

            const url = server.info.uri;
            const log = './test/fixtures/request.log';
            const config = TestHelpers.writeConfig({ url, log, maxSize: 256 });

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.on('data', (data) => {

                expect(data.toString()).to.not.exist();
            });

            broadcast.once('close', (code) => {

                expect(code).to.equal(0);
                done();
            });
        });
    });

    it('handles event that exceeds maxSize', (done) => {

        let broadcast = null;
        let events = [];

        const server = TestHelpers.createTestServer((request, reply) => {

            expect(request.payload.schema).to.equal('good.v1');
            expect(request.payload.events[0].timestamp).to.equal(1469328953222);

            events = events.concat(request.payload.events);
            if (events.length === 1) {
                broadcast.kill('SIGUSR2');
            }

            return reply();
        });

        server.start(() => {

            const url = server.info.uri;
            const log = './test/fixtures/request.log';
            const config = TestHelpers.writeConfig({ url, log, maxSize: 253 });

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.on('data', (data) => {

                expect(data.toString()).match(/eventSize 254 exceeds maxSize 253/);
            });

            broadcast.once('close', (code) => {

                expect(code).to.equal(0);
                done();
            });
        });
    });

    it('handles a log file that exists when newOnly is enabled', (done) => {

        const log = TestHelpers.uniqueFilename();
        let broadcast = null;

        const stream = Fs.createWriteStream(log, { flags: 'a' });
        stream.write(TestHelpers.inlineLogEntry.lineOne.toString());
        stream.write(TestHelpers.inlineLogEntry.lineTwo.toString());

        const server = TestHelpers.createTestServer((request, reply) => {

            expect(request.payload.schema).to.equal('good.v1');
            expect(request.payload.events[0].id).to.equal(TestHelpers.inlineLogEntry.lineThree.id);
            broadcast.kill('SIGUSR2');
        });

        server.start(() => {

            const url = server.info.uri;
            const config = TestHelpers.writeConfig({ url, log, newOnly: true });

            broadcast = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);
            broadcast.stderr.on('data', (data) => {

                expect(data.toString()).to.not.exist();
            });

            broadcast.once('close', (code) => {

                expect(code).to.equal(0);
                done();
            });

            setTimeout(() => {

                stream.write(TestHelpers.inlineLogEntry.lineThree.toString());
            }, 300);
        });
    });

    it('honors resumePath option', (done) => {

        const log = TestHelpers.uniqueFilename();
        const lastIndex = TestHelpers.uniqueFilename();
        const stream = Fs.createWriteStream(log, { flags: 'a' });

        let broadcast1 = null;
        let broadcast2 = null;
        let hitCount = 0;
        const server = TestHelpers.createTestServer((request, reply) => {

            hitCount++;
            expect(request.payload.schema).to.equal('good.v1');
            reply().code(200);

            if (hitCount === 1) {
                expect(request.payload.events[0].id).to.equal(TestHelpers.inlineLogEntry.lineOne.id);

                stream.write('\n' + TestHelpers.inlineLogEntry.lineThree.toString());
                stream.write('\n' + TestHelpers.inlineLogEntry.lineTwo.toString());

                // Need to give the write last index enough time to write itself
                setTimeout(() => {

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

        server.start(() => {

            const url = server.info.uri;
            const resumePath = lastIndex;
            const config = TestHelpers.writeConfig({ url, log, resumePath });

            broadcast1 = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);

            broadcast1.stderr.on('data', (data) => {

                expect(data.toString()).to.not.exist();
            });

            broadcast1.once('close', (code) => {

                expect(code).to.equal(0);

                broadcast2 = ChildProcess.spawn(process.execPath, [broadcastPath, '-c', config]);

                broadcast2.stderr.on('data', (data) => {

                    expect(data.toString()).to.not.exist();
                });

                broadcast2.once('close', (onceCode) => {

                    expect(onceCode).to.equal(0);
                    done();
                });
            });
        });
    });
});
