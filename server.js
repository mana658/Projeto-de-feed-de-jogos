const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
const prisma = new PrismaClient(); 

app.use(cors({ origin: "*" }));
app.use(express.json());

// =========================================================
// Rota para Servir o Jogo Direto do Banco (Substitui arquivos físicos)
// =========================================================
app.get('/api/games/:id/raw', async (req, res) => {
    try {
        const gameId = parseInt(req.params.id);
        const game = await prisma.game.findUnique({
            where: { id: gameId }
        });

        if (!game || !game.code) {
            return res.status(404).send('<h1>Jogo não encontrado</h1>');
        }

        // Script de fuga para o botão ESC funcionar dentro do iframe
        const systemScript = `
        <script>
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    window.parent.postMessage('releaseFocus', '*');
                }
            });
        </script>
        `;

        res.send(game.code + systemScript);
    } catch (error) {
        console.error("Erro ao carregar código do jogo:", error);
        res.status(500).send('Erro interno');
    }
});

// Rota para criar um novo jogo salvando direto no Supabase
app.post('/api/games', async (req, res) => {
    const { title, authorId, code } = req.body;

    if (!title || !authorId || !code) {
        return res.status(400).json({ error: 'Título, autor e código são obrigatórios!' });
    }

    try {
        // Criamos um registro temporário para obter o ID
        const newGame = await prisma.game.create({
            data: { title, authorId, code, sourceUrl: '' }
        });

        // Atualizamos o sourceUrl apontando para a API dinâmica do próprio ID
        const host = req.get('host');
        const protocol = req.protocol;
        const sourceUrl = `${protocol}://${host}/api/games/${newGame.id}/raw`;

        const updatedGame = await prisma.game.update({
            where: { id: newGame.id },
            data: { sourceUrl }
        });

        console.log(`🎮 Jogo "${title}" criado e salvo no Supabase com sucesso!`);
        res.status(201).json(updatedGame);
    } catch (error) {
        console.error("Erro ao criar jogo:", error);
        res.status(500).json({ error: 'Erro interno ao salvar o jogo.' });
    }
});

// Rota de Feed Infinito Circular
app.get('/api/feed', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 2;

    try {
        const totalGames = await prisma.game.count();
        if (totalGames === 0) return res.json([]);

        const skip = ((page - 1) * limit) % totalGames;

        let games = await prisma.game.findMany({
            skip: skip,
            take: limit,
            orderBy: { id: 'asc' }
        });

        if (games.length < limit) {
            const complement = await prisma.game.findMany({
                skip: 0,
                take: limit - games.length,
                orderBy: { id: 'asc' }
            });
            games = [...games, ...complement];
        }

        res.json(games);
    } catch (error) {
        console.error("Erro no banco:", error);
        res.status(500).json({ error: 'Erro ao buscar jogos' });
    }
});

// Rota para Salvar o Código Atualizado (pós-edição no CollabEditor)
app.post('/api/save', async (req, res) => {
    const { sourceUrl, code } = req.body;
    try {
        // Extrai o ID do jogo através da sourceUrl
        const parts = sourceUrl.split('/');
        const gameId = parseInt(parts[parts.indexOf('games') + 1] || parts[parts.length - 2]);

        if (!isNaN(gameId)) {
            await prisma.game.update({
                where: { id: gameId },
                data: { code }
            });
        }

        io.emit('gameFileUpdated', { sourceUrl });
        res.json({ message: 'Jogo atualizado com sucesso no banco!' });
    } catch (error) {
        console.error("Erro ao salvar código:", error);
        res.status(500).json({ error: 'Erro interno ao salvar' });
    }
});

io.on('connection', (socket) => {
    console.log('Um dev se conectou:', socket.id);
    socket.on('codeChange', (newCode) => {
        socket.broadcast.emit('codeUpdate', newCode);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Servidor API e WebSockets rodando na porta ${PORT}`);
});