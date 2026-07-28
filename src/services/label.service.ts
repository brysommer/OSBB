import { prisma } from '../lib/prisma';
import { exec } from 'child_process';
import fs from 'fs/promises';
import { sendZpl } from './zebra.service';
function extractStreetAndBuilding(addressStr: string) {
    // Регулярний вираз:
    // вул\.\s* — шукає "вул." та будь-яку кількість пробілів після
    // ([А-Яа-яҐґЄєІіЇї'’\s]+?) — назва вулиці (літери, апострофи, пробіли)
    // \s+\d+[А-Яа-я]? — пробіл, номер будинку (цифри) і можлива літера (напр. 9а)
    const regex = /вул\.\s*([А-Яа-яҐґЄєІіЇї'’\s]+?\s+\d+[А-Яа-я]?)/;

    const match = addressStr.match(regex);

    // Якщо знайшло — повертає чистий текст із дужок, якщо ні — null
    return match ? match[1].trim() : null;
}

// Приклад роботи:
const address = 'вул. Корольова 9, Під’їзд 1, Квартира 9';
const result = extractStreetAndBuilding(address);

console.log(result); // Виведе: Корольова 9

export async function printMeterQr(dahId: string) {
    const meter = await prisma.meter.findUnique({
        where: {
            dahId,
        },
        include: {
            premises: true,
        },
    });

    if (!meter) {
        throw new Error('Лічильник не знайдено');
    }

    const url = `https://synergia.pp.ua/meter/${meter.dahId}`;

    console.log(meter.premises.name);

    const zpl = `
    CT~~CD,~CC^~CT~
^XA~TA000~JSN^LT0^MNW^MTT^PON^PMN^LH0,0^JMA^PR3,3~SD8^JUS^LRN^CI0^XZ
^XA
^MMT
^PW416
^LL0256
^LS0
^FO32,160^GFA,00768,00768,00012,:Z64:
eJzdkDFOxDAQRScYlCYoJVtAVtyAEqGIUHAQxAUQEjWDoKDkCOwxKFbyVrRcACkr6EkiJGyJrP+O106OQMGvnsaePzOf6D9L2a1IGeXuYBG4oAq3dmCG5sCnBNR6ueFSGI+9x+VNAjTyKjp+T/D9Gi3nhLdoszMn1m7kinHnf5+npefW81n6QgXwKzy53J15NvJpcqhndCUsc/eP+MKzb8jKk5Yc8CU75HlnEwMsCqL0obPqR1guU/hAKuxnEe7FhBEuUSwucZ9Ey1l95BqmaWMmDYzNIhuYzVivFRrUwZS4eoJG6K66enSdSnVIec+xG+rb11gBIRUl18IFHx9hLIspnsfmqeNhH0o+e/pjrQG0TqNQ:F829
^FT196,252^BQN,2,6
^FH\^FDLA,${url}^FS
^FT43,193^A@B,28,29,TT0003M_^FH\^CI17^F8^FD${extractStreetAndBuilding(meter.premises.name)}^FS^CI0
^FT166,179^A0B,102,100^FB147,1,0,R^FH\^FD${meter.name}^FS
^PQ1,0,1,Y^XZ

    `;

    await sendZpl(zpl);
}
