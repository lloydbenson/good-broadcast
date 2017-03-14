'use strict';

const Code = require('code');
const Lab = require('lab');
const Fs = require('fs');
const Log = require('../lib/log');
const TestHelpers = require('./test_helpers');
require('./cleanup');

const lab = exports.lab = Lab.script();
const expect = Code.expect;
const describe = lab.describe;
const it = lab.it;

const internals = {};

describe('Log', () => {

    describe('get()', () => {

        it('reads a log file from the beginning', (done) => {

            const expectedResult = [
                {
                    event: 'request',
                    timestamp: 1369328753222,
                    id: '1369328753222-42369-62002',
                    instance: 'http://localhost:8080',
                    labels: ['api', 'http'],
                    method: 'get',
                    path: '/test',
                    query: {},
                    source: { remoteAddress: '127.0.0.1' },
                    responseTime: 9000,
                    statusCode: 200
                },
                {
                    event: 'request',
                    timestamp: 1469328953222,
                    id: '1469328953222-42369-62002',
                    instance: 'http://localhost:8080',
                    labels: ['api', 'http'],
                    method: 'get',
                    path: '/test2',
                    query: {},
                    source: { remoteAddress: '127.0.0.1' },
                    responseTime: 19,
                    statusCode: 200
                }
            ];

            Log.get('test/fixtures/request.log', 0, (bytesRead, result) => {

                expect(bytesRead).to.equal(509);
                expect(result).to.equal(expectedResult);
                done();
            });
        });

        it('does not load a log file', (done) => {

            const trapConsole = console.error;
            Log.get('test/fixtures/nofile.log', 0, (bytesRead, result) => {

                console.error = trapConsole;
                expect(bytesRead).to.equal(0);
                expect(result).to.equal([]);
                done();
            });
            console.error = function (string) {

                expect(string).to.match(/ENOENT/);
            };
        });

        it('reads to the end of valid JSON', (done) => {

            const expectedResult = [{ event: 'request',
                timestamp: 1369328753222,
                id: '1369328753222-42369-62002',
                instance: 'http://localhost:8080',
                labels: ['api', 'http'],
                method: 'get',
                path: '/test',
                query: {},
                source: { remoteAddress: '127.0.0.1' },
                responseTime: 9,
                statusCode: 200
            }];

            Log.get('test/fixtures/incomplete.log', 0, (bytesRead, result) => {

                expect(bytesRead).to.equal(252);
                expect(result).to.equal(expectedResult);
                done();
            });
        });

        it('catches invalid JSON in log files', (done) => {

            const file = TestHelpers.uniqueFilename();
            const stream = Fs.createWriteStream(file, { flags: 'a' });
            const log = console.error;

            console.error = function (error) {

                expect(error.message).to.contain('Unexpected token');
                console.error = log;
            };

            stream.write('{non-JSON string}\nanother weird string}');

            Log.get(file, 0, (bytesRead, result) => {

                expect(bytesRead).to.equal(39);
                expect(result).to.be.empty();
                done();
            });
        });
    });
});
