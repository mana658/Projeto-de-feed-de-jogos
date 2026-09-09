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
// Rota para Servir o Jogo Direto do Banco
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

// =========================================================
// Rota para criar um novo jogo
// =========================================================
app.post('/api/games', async (req, res) => {
    const { title, authorId, code } = req.body;

    if (!title || !authorId || !code) {
        return res.status(400).json({ error: 'Título, autor e código são obrigatórios!' });
    }

    try {
        const newGame = await prisma.game.create({
            data: { title, authorId, code, sourceUrl: '' }
        });

        const host = req.get('host');
        const protocol = req.protocol;
        const sourceUrl = `${protocol}://${host}/api/games/${newGame.id}/raw`;

        const updatedGame = await prisma.game.update({
            where: { id: newGame.id },
            data: { sourceUrl }
        });

        res.status(201).json(updatedGame);
    } catch (error) {
        res.status(500).json({ error: 'Erro interno ao salvar o jogo.' });
    }
});

// =========================================================
// Rota de Feed (MODO DIAGNÓSTICO PROFUNDO)
// =========================================================
app.get('/api/feed', async (req, res) => {
    try {
        // Tenta puxar tudo sem filtros para testar a saúde da tabela
        const count = await prisma.game.count();
        const allGames = await prisma.game.findMany();

        res.status(200).json({
            status: "✅ Conexão bem-sucedida com o Supabase!",
            jogosEncontrados: count,
            dica: count === 0 ? "O Prisma conectou, mas ele enxerga a tabela Game zerada." : "Jogos carregados!",
            dados: allGames
        });
    } catch (error) {
        // Agora o erro não é escondido, ele vai direto pra tela do navegador!
        res.status(200).json({
            status: "❌ Erro Fatal no Prisma",
            codigoDoErro: error.code,
            mensagemExata: error.message
        });
    }
});

// =========================================================
// Rota para Salvar o Código Atualizado
// =========================================================
app.post('/api/save', async (req, res) => {
    const { sourceUrl, code } = req.body;
    try {
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
    console.log(`Servidor rodando na porta ${PORT}`);
});