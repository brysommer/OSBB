import { prisma } from '../lib/prisma';

const crudDB = async () => {
    await prisma.residentialComplex.create({
        data: {
            name: 'ЗігЗаг',
            shortName: 'ЗігЗаг',
        },
    });
};

crudDB();
