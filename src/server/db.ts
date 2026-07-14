import { PrismaClient } from '@prisma/client';

// Eén gedeelde Prisma-client voor de hele server.
export const prisma = new PrismaClient();
