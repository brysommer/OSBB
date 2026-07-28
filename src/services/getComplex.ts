import { prisma } from '../lib/prisma';

export async function getResidentialComplexes() {
    return prisma.residentialComplex.findMany({
        orderBy: {
            name: 'asc',
        },
    });
}
