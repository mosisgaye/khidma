import { PrismaClient } from '@prisma/client';

// Configuration Prisma avec logging selon l'environnement
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'info', 'warn', 'error']
    : ['error'],
  errorFormat: 'pretty',
});

// Gestion gracieuse de la déconnexion
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
export { prisma };