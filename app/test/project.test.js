
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appDirectory = path.resolve(__dirname, '..');

test('CampusBite server file exists', () => {
    assert.equal(
        fs.existsSync(path.join(appDirectory, 'server.js')),
        true
    );
});

test('CampusBite package configuration exists', () => {
    assert.equal(
        fs.existsSync(path.join(appDirectory, 'package.json')),
        true
    );
});

test('CampusBite Dockerfile exists', () => {
    assert.equal(
        fs.existsSync(path.join(appDirectory, 'Dockerfile')),
        true
    );
});

test('CampusBite website files exist', () => {
    const publicDirectory = path.join(appDirectory, 'public');

    assert.equal(fs.existsSync(path.join(publicDirectory, 'index.html')), true);
    assert.equal(fs.existsSync(path.join(publicDirectory, 'style.css')), true);
    assert.equal(fs.existsSync(path.join(publicDirectory, 'app.js')), true);
});
