import { promises as fs } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Client } from 'basic-ftp';
import SftpClient from 'ssh2-sftp-client';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { validateMetersAgainstAskoe, dahPeriodFromSnapshotDate } from './askoeValidation.service';

type AskoeRow = Record<string, unknown>;

export type AskoeImportResult = {
    sourceFile: string;
    snapshotDate: Date;
    total: number;
    active: number;
    noAnswer: number;
    matched: number;
    unmatched: number;
    validated?: number;
    validationFailed?: number;
};

function stringValue(value: unknown): string | undefined {
    if (value == null || value === '') return undefined;
    return String(value);
}

function numberValue(value: unknown): number | undefined {
    if (value == null || value === '') return undefined;

    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
}

function integerValue(value: unknown): number | undefined {
    const number = numberValue(value);
    return number == null ? undefined : Math.trunc(number);
}

function jsonValue(row: AskoeRow): Prisma.InputJsonValue {
    const safeRow = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
            key,
            typeof value === 'bigint' ? value.toString() : value,
        ]),
    );

    return JSON.parse(JSON.stringify(safeRow)) as Prisma.InputJsonValue;
}

function parseSnapshotDate(fileName: string): Date {
    const match = fileName.match(/(\d{2})\.(\d{2})\.(\d{4})/);

    if (match) {
        return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
    }

    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isAskoeHeatMeterSnapshot(fileName: string): boolean {
    return /heat_meters_\d{2}\.\d{2}\.\d{4}/.test(fileName) && /\.(db|sqlite|sql)$/i.test(fileName);
}

function snapshotDateKey(fileName: string): string {
    const match = fileName.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!match) return '';

    return `${match[3]}-${match[2]}-${match[1]}`;
}

function readRequestedHeatMeters(filePath: string): AskoeRow[] {
    const file = new Database(filePath, { readonly: true });

    try {
        return file
            .prepare('SELECT * FROM RequestedHeatMeters')
            .all() as AskoeRow[];
    } finally {
        file.close();
    }
}

async function readAskoeRows(filePath: string): Promise<AskoeRow[]> {
    const header = (await fs.readFile(filePath)).subarray(0, 16).toString('utf8');

    if (header === 'SQLite format 3\u0000') {
        return readRequestedHeatMeters(filePath);
    }

    const sqlDump = await fs.readFile(filePath, 'utf8');
    const memoryDatabase = new Database(':memory:');

    try {
        memoryDatabase.exec(sqlDump);
        return memoryDatabase
            .prepare('SELECT * FROM RequestedHeatMeters')
            .all() as AskoeRow[];
    } finally {
        memoryDatabase.close();
    }
}

async function getDownloadDir(): Promise<string> {
    const downloadDir =
        process.env.ASKOE_DOWNLOAD_DIR || path.join(process.cwd(), 'data', 'askoe');

    await fs.mkdir(downloadDir, { recursive: true });

    return downloadDir;
}

async function downloadLatestAskoeFileViaFtp(): Promise<{
    filePath: string;
    sourceFile: string;
}> {
    const host = process.env.ASKOE_FTP_HOST;
    const user = process.env.ASKOE_FTP_USER;
    const password = process.env.ASKOE_FTP_PASSWORD;
    const remoteDir = process.env.ASKOE_FTP_DIR;

    if (!host || !user || !password || !remoteDir) {
        throw new Error(
            'ASKOE_FTP_HOST, ASKOE_FTP_USER, ASKOE_FTP_PASSWORD and ASKOE_FTP_DIR are required',
        );
    }

    const client = new Client(30_000);
    const prefix = process.env.ASKOE_FTP_FILE_PREFIX || 'mcl_';
    const downloadDir = await getDownloadDir();

    try {
        await client.access({
            host,
            port: Number(process.env.ASKOE_FTP_PORT || 21),
            user,
            password,
            secure: false,
        });

        const files = (await client.list(remoteDir))
            .filter(
                (file) =>
                    file.type === 1 &&
                    file.name.startsWith(prefix) &&
                    /\.(db|sqlite|sql)$/i.test(file.name),
            )
            .sort((left, right) => {
                const leftTime = left.modifiedAt?.getTime() || 0;
                const rightTime = right.modifiedAt?.getTime() || 0;
                return rightTime - leftTime || right.name.localeCompare(left.name);
            });

        const latest = files[0];

        if (!latest) {
            throw new Error('No ASKOE snapshot file found on FTP');
        }

        const safeLocalName = latest.name.replace(/[<>:"/\\|?*]/g, '-');
        const localPath = path.join(downloadDir, safeLocalName);
        const remotePath = `${remoteDir.replace(/\/+$/, '')}/${latest.name}`;

        await client.downloadTo(localPath, remotePath);

        return {
            filePath: localPath,
            sourceFile: latest.name,
        };
    } finally {
        client.close();
    }
}

async function downloadLatestAskoeFileViaSftp(): Promise<{
    filePath: string;
    sourceFile: string;
}> {
    const host = process.env.ASKOE_SFTP_HOST;
    const user = process.env.ASKOE_SFTP_USER;
    const password = process.env.ASKOE_SFTP_PASSWORD;
    const remoteDir = process.env.ASKOE_SFTP_DIR;

    if (!host || !user || !password || !remoteDir) {
        throw new Error(
            'ASKOE_SFTP_HOST, ASKOE_SFTP_USER, ASKOE_SFTP_PASSWORD and ASKOE_SFTP_DIR are required',
        );
    }

    const client = new SftpClient();
    const downloadDir = await getDownloadDir();

    try {
        await client.connect({
            host,
            port: Number(process.env.ASKOE_SFTP_PORT || 22),
            username: user,
            password,
        });

        const files = (await client.list(remoteDir))
            .filter((file) => file.type === '-' && isAskoeHeatMeterSnapshot(file.name))
            .sort(
                (left, right) =>
                    snapshotDateKey(right.name).localeCompare(snapshotDateKey(left.name)) ||
                    right.name.localeCompare(left.name),
            );
        const latest = files[0];

        if (!latest) {
            throw new Error('No ASKOE snapshot file found on SFTP');
        }

        const safeLocalName = latest.name.replace(/[<>:"/\\|?*]/g, '-');
        const localPath = path.join(downloadDir, safeLocalName);
        const remotePath = `${remoteDir.replace(/\/+$/, '')}/${latest.name}`;

        await client.fastGet(remotePath, localPath);

        return {
            filePath: localPath,
            sourceFile: latest.name,
        };
    } finally {
        await client.end().catch(() => undefined);
    }
}

async function downloadLatestAskoeFile() {
    return process.env.ASKOE_SOURCE === 'ftp'
        ? downloadLatestAskoeFileViaFtp()
        : downloadLatestAskoeFileViaSftp();
}

async function downloadAskoeFileViaSftp(matcher: (fileName: string) => boolean): Promise<{
    filePath: string;
    sourceFile: string;
}> {
    const host = process.env.ASKOE_SFTP_HOST;
    const user = process.env.ASKOE_SFTP_USER;
    const password = process.env.ASKOE_SFTP_PASSWORD;
    const remoteDir = process.env.ASKOE_SFTP_DIR;

    if (!host || !user || !password || !remoteDir) {
        throw new Error(
            'ASKOE_SFTP_HOST, ASKOE_SFTP_USER, ASKOE_SFTP_PASSWORD and ASKOE_SFTP_DIR are required',
        );
    }

    const client = new SftpClient();
    const downloadDir = await getDownloadDir();

    try {
        await client.connect({
            host,
            port: Number(process.env.ASKOE_SFTP_PORT || 22),
            username: user,
            password,
        });

        const files = (await client.list(remoteDir))
            .filter((file) => file.type === '-' && isAskoeHeatMeterSnapshot(file.name) && matcher(file.name))
            .sort(
                (left, right) =>
                    snapshotDateKey(right.name).localeCompare(snapshotDateKey(left.name)) ||
                    right.name.localeCompare(left.name),
            );
        const selected = files[0];

        if (!selected) {
            throw new Error('No ASKOE snapshot file found on SFTP for the requested date');
        }

        const safeLocalName = selected.name.replace(/[<>:"/\\|?*]/g, '-');
        const localPath = path.join(downloadDir, safeLocalName);
        const remotePath = `${remoteDir.replace(/\/+$/, '')}/${selected.name}`;

        await client.fastGet(remotePath, localPath);

        return {
            filePath: localPath,
            sourceFile: selected.name,
        };
    } finally {
        await client.end().catch(() => undefined);
    }
}

export async function downloadAskoeSnapshotForDate(dayMonthYear: string): Promise<{
    filePath: string;
    sourceFile: string;
}> {
    return downloadAskoeFileViaSftp((fileName) => fileName.includes(`heat_meters_${dayMonthYear}`));
}

export async function importAskoeSnapshotFromFile(
    filePath: string,
    sourceFile: string,
    options?: { validate?: boolean },
): Promise<AskoeImportResult> {
    const rows = await readAskoeRows(filePath);

    if (!rows.length) {
        throw new Error(`ASKOE snapshot ${sourceFile} is empty`);
    }

    const snapshotDate = parseSnapshotDate(sourceFile);
    const serialNumbers = [
        ...new Set(
            rows
                .map((row) => stringValue(row.serialNumber))
                .filter((serial): serial is string => !!serial),
        ),
    ];
    const meters = await prisma.meter.findMany({
        where: { serialNumber: { in: serialNumbers } },
        select: { id: true, serialNumber: true },
    });
    const meterBySerial = new Map(
        meters
            .filter((meter): meter is typeof meter & { serialNumber: string } => !!meter.serialNumber)
            .map((meter) => [meter.serialNumber, meter.id]),
    );

    let active = 0;
    let noAnswer = 0;
    let matched = 0;

    for (const row of rows) {
        const serialNumber = stringValue(row.serialNumber);

        if (!serialNumber) continue;

        const manufacturer = stringValue(row.man) || '';
        const deviceStatus = stringValue(row.deviceStatus) || 'NoAnswer';
        const meterId = meterBySerial.get(serialNumber) || null;

        if (deviceStatus === 'Active') active++;
        if (deviceStatus === 'NoAnswer') noAnswer++;
        if (meterId) matched++;

        await prisma.meterDetail.upsert({
            where: {
                snapshotDate_serialNumber_manufacturer: {
                    snapshotDate,
                    serialNumber,
                    manufacturer,
                },
            },
            create: {
                snapshotDate,
                serialNumber,
                manufacturer,
                deviceType: stringValue(row.deviceType),
                deviceVersion: integerValue(row.deviceVer),
                deviceStatus,
                requestedAt: stringValue(row.dateTimeOfRequest),
                deviceAt: stringValue(row.dateTimeOnDevice),
                energy: numberValue(row.E),
                energyUnit: stringValue(row.Eu),
                volume: numberValue(row.V),
                volumeUnit: stringValue(row.Vu),
                power: numberValue(row.P),
                powerUnit: stringValue(row.Pu),
                flow: numberValue(row.F),
                flowUnit: stringValue(row.Fu),
                temperature1: numberValue(row.T1),
                temperature1Unit: stringValue(row.T1u),
                temperature2: numberValue(row.T2),
                temperature2Unit: stringValue(row.T2u),
                temperatureDifference: numberValue(row.dT),
                temperatureDifferenceUnit: stringValue(row.dTu),
                errorFlag: integerValue(row.errorFlag),
                statusField: stringValue(row.statusField),
                operatingTime: integerValue(row.operatingTime),
                operatingTimeUnit: stringValue(row.operatingTimeU),
                operatingTimeWithError: integerValue(row.operatingTimeWithError),
                operatingTimeWithErrorUnit: stringValue(row.operatingTimeWithErrorU),
                rawData: jsonValue(row),
                sourceFile,
                meterId,
            },
            update: {
                manufacturer,
                deviceType: stringValue(row.deviceType),
                deviceVersion: integerValue(row.deviceVer),
                deviceStatus,
                requestedAt: stringValue(row.dateTimeOfRequest),
                deviceAt: stringValue(row.dateTimeOnDevice),
                energy: numberValue(row.E),
                energyUnit: stringValue(row.Eu),
                volume: numberValue(row.V),
                volumeUnit: stringValue(row.Vu),
                power: numberValue(row.P),
                powerUnit: stringValue(row.Pu),
                flow: numberValue(row.F),
                flowUnit: stringValue(row.Fu),
                temperature1: numberValue(row.T1),
                temperature1Unit: stringValue(row.T1u),
                temperature2: numberValue(row.T2),
                temperature2Unit: stringValue(row.T2u),
                temperatureDifference: numberValue(row.dT),
                temperatureDifferenceUnit: stringValue(row.dTu),
                errorFlag: integerValue(row.errorFlag),
                statusField: stringValue(row.statusField),
                operatingTime: integerValue(row.operatingTime),
                operatingTimeUnit: stringValue(row.operatingTimeU),
                operatingTimeWithError: integerValue(row.operatingTimeWithError),
                operatingTimeWithErrorUnit: stringValue(row.operatingTimeWithErrorU),
                rawData: jsonValue(row),
                sourceFile,
                meterId,
            },
        });
    }

    const validatedMeters =
        options?.validate === false
            ? []
            : await validateMetersAgainstAskoe({
                  meterIds: [...meterBySerial.values()],
                  snapshotDate,
                  dahPeriod: dahPeriodFromSnapshotDate(snapshotDate),
              });

    return {
        sourceFile,
        snapshotDate,
        total: rows.length,
        active,
        noAnswer,
        matched,
        unmatched: rows.length - matched,
        validated: validatedMeters.filter((item) => item.status === 'VALIDATED').length,
        validationFailed: validatedMeters.filter(
            (item) => item.status === 'VALIDATION_FAILED',
        ).length,
    };
}

export async function importAskoeSnapshotForDate(
    dayMonthYear: string,
    options?: { validate?: boolean },
): Promise<AskoeImportResult> {
    const { filePath, sourceFile } = await downloadAskoeSnapshotForDate(dayMonthYear);

    return importAskoeSnapshotFromFile(filePath, sourceFile, options);
}

export async function importLatestAskoeSnapshot(): Promise<AskoeImportResult> {
    const { filePath, sourceFile } = await downloadLatestAskoeFile();

    return importAskoeSnapshotFromFile(filePath, sourceFile);
}
