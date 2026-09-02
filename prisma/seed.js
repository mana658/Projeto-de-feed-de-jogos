const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Limpando banco de dados...');
    await prisma.game.deleteMany();

    const games = [
        { title: 'Memory Rush', authorId: 'Dev_Master', sourceUrl: 'http://localhost:3001/games/memory.html' },
        { title: 'Asteroids Retro', authorId: 'SpaceNinja', sourceUrl: 'http://localhost:3001/games/asteroids.html' },
        { title: 'Color Match', authorId: 'PixelArtist', sourceUrl: 'http://localhost:3001/games/colormatch.html' },
        { title: 'Flappy Clone', authorId: 'BirdLover', sourceUrl: 'http://localhost:3001/games/flappy.html' },
        { title: 'Snake 3000', authorId: 'RetroDev', sourceUrl: 'http://localhost:3001/games/snake.html' }
    ];

    console.log('Inserindo jogos reais...');
    for (const game of games) {
        await prisma.game.create({ data: game });
    }
    
    console.log('✅ Banco populado com sucesso com 5 jogos!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });