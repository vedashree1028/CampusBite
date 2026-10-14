const test = require('node:test');
const assert = require('node:assert/strict');

test('CampusBite health API returns success and database status', async () => {
    const response = await fetch('http://localhost:3002/api/status', {
        signal: AbortSignal.timeout(5000)
    });

    assert.equal(response.status, 200);

    const data = await response.json();

    assert.equal(data.success, true);
    assert.equal(data.database, 'Connected');
});
