import { exec } from 'child_process';
import { writeFile } from 'fs/promises';

const PRINTER = '\\\\HOME-PC\\zebra';

export async function sendZpl(zpl: string) {
    await writeFile('temp.zpl', zpl, 'utf8');

    const cmd = `copy /b temp.zpl "${PRINTER}"`;

    console.log(cmd);

    return new Promise<void>((resolve, reject) => {
        exec(cmd, { shell: 'cmd.exe' }, (error, stdout, stderr) => {
            console.log('stdout:', stdout);
            console.log('stderr:', stderr);

            if (error) {
                console.error(error);
                reject(error);
                return;
            }

            resolve();
        });
    });
}
