import assert from 'node:assert/strict';
import test from 'node:test';

import {
    isSynergiaGlass,
    isValidHeatSerialNumber,
    normalizeHeatSerialNumber,
} from './heatMeterMapping.service';
import { extractHeatSerialNumber } from './heatSerialOcr.service';

test('normalizes numeric serial numbers', () => {
    assert.equal(normalizeHeatSerialNumber(' 21-011 808 '), '21011808');
    assert.equal(isValidHeatSerialNumber('21011808'), true);
    assert.equal(isValidHeatSerialNumber('MRN-21011808'), false);
});

test('detects the Synergia Glass complex name', () => {
    assert.equal(isSynergiaGlass('Синергія GLASS'), true);
    assert.equal(isSynergiaGlass('Синергія Глес'), true);
    assert.equal(isSynergiaGlass('Синергія LIGHT'), false);
});

test('extracts a serial number from structured OCR output', () => {
    assert.deepEqual(
        extractHeatSerialNumber('{"serialNumber":"21 011 808","confidence":0.94}'),
        { serialNumber: '21011808', confidence: 0.94 },
    );
});

test('extracts a serial number from fallback OCR text', () => {
    assert.deepEqual(extractHeatSerialNumber('На фото: 21011808'), {
        serialNumber: '21011808',
        confidence: undefined,
    });
});

test('rejects OCR output without a numeric serial number', () => {
    assert.throws(
        () => extractHeatSerialNumber('номер не видно'),
        /OCR did not find a serial number/,
    );
});
