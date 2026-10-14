const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('CampusBite exposes a health endpoint and Prometheus metrics endpoint', () => {
    const serverPath = path.join(__dirname, '..', 'server.js');
    const server = fs.readFileSync(serverPath, 'utf8');

    assert.match(server, /\/api\/status/);
    assert.match(server, /\/metrics/);
});

test('CampusBite package includes the Prometheus client', () => {
    const packagePath = path.join(__dirname, '..', 'package.json');
    const config = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    assert.ok(config.dependencies['prom-client']);
});
